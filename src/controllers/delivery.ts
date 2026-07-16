import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createDeliverySchema, updateDeliveryStatusSchema, rateDeliverySchema } from '../schemas/delivery';
import { emitToUser, emitToDelivery } from '../services/socket';
import { sendSMS } from '../services/notification';
import axios from 'axios';

const prisma = new PrismaClient();

// Haversine distance in km (fallback)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Road distance via Google Maps Directions API, falls back to haversine
async function getRoadDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): Promise<{ distanceKm: number; durationMin: number; source: 'google' | 'haversine' }> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
        try {
            const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat1},${lng1}&destination=${lat2},${lng2}&mode=driving&key=${apiKey}`;
            const { data } = await axios.get(url, { timeout: 5000 });
            if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
                const leg = data.routes[0].legs[0];
                return {
                    distanceKm: leg.distance.value / 1000,
                    durationMin: Math.ceil(leg.duration.value / 60),
                    source: 'google',
                };
            }
        } catch (_) {
            // fall through to haversine
        }
    }
    return {
        distanceKm: haversineKm(lat1, lng1, lat2, lng2),
        durationMin: 0,
        source: 'haversine',
    };
}

// Zone-based pricing (GHS)
function calculatePrice(distanceKm: number): number {
    if (distanceKm <= 3) return 8;
    if (distanceKm <= 5) return 12;
    if (distanceKm <= 10) return 18;
    if (distanceKm <= 15) return 25;
    if (distanceKm <= 25) return 35;
    return 35 + Math.ceil((distanceKm - 25) / 5) * 8;
}

function generateTrackingCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ZD-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// GET /deliveries/price-estimate
export const getPriceEstimate = async (req: AuthRequest, res: Response) => {
    try {
        const pickupLat = parseFloat(req.query.pickupLat as string);
        const pickupLng = parseFloat(req.query.pickupLng as string);
        const dropoffLat = parseFloat(req.query.dropoffLat as string);
        const dropoffLng = parseFloat(req.query.dropoffLng as string);
        const stopsQuery = req.query.stops as string;

        if (isNaN(pickupLat) || isNaN(pickupLng)) {
            return res.status(400).json({ error: 'Pickup coordinates are required' });
        }

        let totalDistanceKm = 0;
        let totalDurationMin = 0;
        let stopsCount = 1;

        if (stopsQuery) {
            try {
                const parsedStops = JSON.parse(stopsQuery);
                if (Array.isArray(parsedStops) && parsedStops.length > 0) {
                    stopsCount = parsedStops.length;
                    let currLat = pickupLat;
                    let currLng = pickupLng;
                    for (const s of parsedStops) {
                        const { distanceKm, durationMin } = await getRoadDistanceKm(currLat, currLng, Number(s.lat || s.dropoffLat), Number(s.lng || s.dropoffLng));
                        totalDistanceKm += distanceKm;
                        totalDurationMin += durationMin;
                        currLat = Number(s.lat || s.dropoffLat);
                        currLng = Number(s.lng || s.dropoffLng);
                    }
                }
            } catch (_) {
                // Ignore parse errors, fall through to dropoffLat check
            }
        }

        if (totalDistanceKm === 0) {
            if (isNaN(dropoffLat) || isNaN(dropoffLng)) {
                return res.status(400).json({ error: 'Dropoff coordinates are required' });
            }
            const { distanceKm, durationMin } = await getRoadDistanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
            totalDistanceKm = distanceKm;
            totalDurationMin = durationMin;
        }

        let price = calculatePrice(totalDistanceKm);
        if (stopsCount > 1) {
            price = price + (stopsCount - 1) * 10;
        }

        res.json({
            distanceKm: Math.round(totalDistanceKm * 10) / 10,
            durationMin: totalDurationMin,
            price: Math.round(price * 100) / 100,
            stopsCount,
            source: 'google',
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// POST /deliveries
export const createDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const data = createDeliverySchema.parse(req.body);
        const senderId = req.user!.userId;

        let totalDistanceKm = 0;
        let price = 0;
        const isBulk = Boolean(data.isBulk && data.stops && data.stops.length > 0);

        if (isBulk && data.stops && data.stops.length > 0) {
            let currLat = data.pickupLat;
            let currLng = data.pickupLng;
            for (const s of data.stops) {
                totalDistanceKm += haversineKm(currLat, currLng, s.dropoffLat, s.dropoffLng);
                currLat = s.dropoffLat;
                currLng = s.dropoffLng;
            }
            price = calculatePrice(totalDistanceKm) + (data.stops.length - 1) * 10;
        } else {
            totalDistanceKm = haversineKm(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng);
            price = calculatePrice(totalDistanceKm);
        }

        // Generate unique tracking code
        let trackingCode = generateTrackingCode();
        let exists = await prisma.delivery.findUnique({ where: { trackingCode } });
        while (exists) {
            trackingCode = generateTrackingCode();
            exists = await prisma.delivery.findUnique({ where: { trackingCode } });
        }

        const firstStop = (isBulk && data.stops && data.stops.length > 0) ? data.stops[0] : null;
        const delivery = await prisma.delivery.create({
            data: {
                senderId,
                packageDesc: isBulk ? (data.packageDesc || `Bulk Dispatch (${data.stops!.length} stops)`) : data.packageDesc,
                pickupAddress: data.pickupAddress,
                pickupLat: data.pickupLat,
                pickupLng: data.pickupLng,
                pickupPhone: data.pickupPhone,
                dropoffAddress: isBulk && firstStop ? firstStop.dropoffAddress : data.dropoffAddress,
                dropoffLat: isBulk && firstStop ? firstStop.dropoffLat : data.dropoffLat,
                dropoffLng: isBulk && firstStop ? firstStop.dropoffLng : data.dropoffLng,
                receiverName: isBulk && firstStop ? (data.receiverName || firstStop.receiverName || `Bulk (${data.stops!.length} Receivers)`) : data.receiverName,
                receiverPhone: isBulk && firstStop ? (data.receiverPhone || firstStop.receiverPhone || data.pickupPhone) : data.receiverPhone,
                distanceKm: Math.round(totalDistanceKm * 10) / 10,
                price: Math.round(price * 100) / 100,
                paymentMethod: data.paymentMethod || 'CASH',
                trackingCode,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
                isBulk,
                stops: isBulk ? (data.stops as any) : null,
            },
        });

        // Notify nearby online couriers
        const nearbyCouriers = await prisma.courierProfile.findMany({
            where: { isOnline: true, isApproved: true },
        });

        for (const courier of nearbyCouriers) {
            if (courier.currentLat && courier.currentLng) {
                const dist = haversineKm(courier.currentLat, courier.currentLng, data.pickupLat, data.pickupLng);
                if (dist <= 10) {
                    emitToUser(courier.userId, 'NEW_DELIVERY_REQUEST', {
                        id: delivery.id,
                        packageDesc: delivery.packageDesc,
                        pickupAddress: delivery.pickupAddress,
                        dropoffAddress: delivery.dropoffAddress,
                        distanceKm: delivery.distanceKm,
                        price: delivery.price,
                    });
                }
            }
        }

        // SMS to sender
        await sendSMS(data.pickupPhone, `Your Zenran delivery ${trackingCode} has been requested. We're finding a courier for you.`);

        res.status(201).json(delivery);
    } catch (error: any) {
        if (error instanceof ZodError || error.name === 'ZodError') {
            const firstIssue = error.errors?.[0]?.message || error.issues?.[0]?.message || error.message;
            return res.status(400).json({ error: firstIssue });
        }
        res.status(400).json({ error: error.message || 'Could not create package delivery request.' });
    }
};

// POST /deliveries/:id/accept  (courier accepts)
export const acceptDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const courierId = req.user!.userId;

        const delivery = await prisma.delivery.findUnique({ where: { id } });
        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
        if (delivery.status !== 'REQUESTED') return res.status(400).json({ error: 'Delivery already taken' });

        // Verify user has a courier profile
        const profile = await prisma.courierProfile.findUnique({ where: { userId: courierId } });
        if (!profile) return res.status(403).json({ error: 'No courier profile found' });

        const updated = await prisma.delivery.update({
            where: { id },
            data: { courierId, status: 'ACCEPTED' },
            include: { courier: { select: { id: true, name: true, phone: true } } },
        });

        // Notify sender
        emitToUser(delivery.senderId, 'DELIVERY_STATUS_UPDATE', updated);
        emitToDelivery(id, 'DELIVERY_STATUS_UPDATE', updated);

        const courierName = updated.courier?.name || 'A courier';
        await sendSMS(delivery.pickupPhone, `${courierName} is on the way to pick up your package (${delivery.trackingCode}).`);

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// PATCH /deliveries/:id/status  (courier updates status)
export const updateDeliveryStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const { status, cancelReason } = updateDeliveryStatusSchema.parse(req.body);

        const delivery = await prisma.delivery.findUnique({ where: { id } });
        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

        // Only assigned courier or sender (for cancel) can update
        const isCourier = delivery.courierId === userId;
        const isSender = delivery.senderId === userId;
        if (!isCourier && !isSender) return res.status(403).json({ error: 'Unauthorized' });

        // Sender can only cancel (if they are not the assigned courier)
        if (isSender && !isCourier && status !== 'CANCELLED') return res.status(403).json({ error: 'You can only cancel' });

        const updateData: any = { status };

        if (status === 'PICKED_UP') updateData.pickedUpAt = new Date();
        if (status === 'DELIVERED') updateData.deliveredAt = new Date();
        if (status === 'CANCELLED') updateData.cancelReason = cancelReason;

        const updated = await prisma.delivery.update({
            where: { id },
            data: updateData,
            include: { courier: { select: { id: true, name: true, phone: true } } },
        });

        // Update courier stats on completion or delivery
        if ((status === 'COMPLETED' || status === 'DELIVERED') && delivery.courierId) {
            await prisma.courierProfile.update({
                where: { userId: delivery.courierId },
                data: { totalDeliveries: { increment: 1 } },
            });
        }

        // Notify both parties
        emitToUser(delivery.senderId, 'DELIVERY_STATUS_UPDATE', updated);
        if (delivery.courierId) emitToUser(delivery.courierId, 'DELIVERY_STATUS_UPDATE', updated);
        emitToDelivery(id, 'DELIVERY_STATUS_UPDATE', updated);

        // SMS to receiver when courier is close
        if (status === 'ARRIVED_DROPOFF') {
            await sendSMS(delivery.receiverPhone, `Your package from ${delivery.pickupAddress} has arrived! Tracking: ${delivery.trackingCode}`);
        }

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

// GET /deliveries/my  (sender's deliveries)
export const getMyDeliveries = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const deliveries = await prisma.delivery.findMany({
            where: { senderId: userId },
            include: { courier: { select: { id: true, name: true, phone: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(deliveries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /deliveries/:id
export const getDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const delivery = await prisma.delivery.findUnique({
            where: { id },
            include: {
                courier: { select: { id: true, name: true, phone: true } },
                trackingPoints: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
        });

        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
        if (delivery.senderId !== userId && delivery.courierId !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        res.json(delivery);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /deliveries/track/:trackingCode  (public tracking by code)
export const trackDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { trackingCode } = req.params;
        const delivery = await prisma.delivery.findUnique({
            where: { trackingCode },
            select: {
                id: true,
                status: true,
                trackingCode: true,
                pickupAddress: true,
                pickupLat: true,
                pickupLng: true,
                dropoffAddress: true,
                dropoffLat: true,
                dropoffLng: true,
                receiverName: true,
                createdAt: true,
                pickedUpAt: true,
                deliveredAt: true,
                courier: { select: { id: true, name: true, phone: true } },
                trackingPoints: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
        });

        if (!delivery) return res.status(404).json({ error: 'Tracking code not found' });
        res.json(delivery);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

// GET /deliveries/track/:trackingCode/live  (public tracking web page)
export const liveTrackingPage = async (req: AuthRequest, res: Response) => {
    const { trackingCode } = req.params;
    const safeCode = trackingCode.replace(/[^A-Za-z0-9-]/g, '');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Zenran Live Tracking</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    body { margin:0; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background:#f3f5f7; color:#1f2937; }
    .top { background: linear-gradient(135deg,#FF6B35,#E8451E); color:#fff; padding:16px; }
    .title { font-size:18px; font-weight:800; }
    .sub { opacity:.9; font-size:13px; margin-top:4px; }
    .card { margin:12px; background:#fff; border-radius:14px; padding:14px; box-shadow:0 2px 10px rgba(0,0,0,.06); }
    .status { font-size:16px; font-weight:700; margin-bottom:8px; }
    .row { display:flex; justify-content:space-between; gap:10px; font-size:13px; color:#6b7280; }
    #map { height:360px; border-radius:14px; overflow:hidden; }
    .pill { display:inline-block; margin-top:8px; font-size:12px; color:#374151; background:#f3f4f6; border-radius:999px; padding:6px 10px; }
  </style>
</head>
<body>
  <div class="top">
    <div class="title">Zenran Delivery Tracking</div>
    <div class="sub">Tracking code: ${safeCode}</div>
  </div>

  <div class="card">
    <div id="status" class="status">Loading...</div>
    <div class="row"><span>Courier</span><span id="courier">Assigning...</span></div>
    <div class="row"><span>Pickup</span><span id="pickup">-</span></div>
    <div class="row"><span>Dropoff</span><span id="dropoff">-</span></div>
    <div class="pill" id="updatedAt">Waiting for updates...</div>
  </div>

  <div class="card"><div id="map"></div></div>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const trackingCode = ${JSON.stringify(safeCode)};
    const map = L.map('map').setView([5.6037, -0.1870], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    let pickupMarker = null;
    let dropoffMarker = null;
    let courierMarker = null;

    const statusEl = document.getElementById('status');
    const courierEl = document.getElementById('courier');
    const pickupEl = document.getElementById('pickup');
    const dropoffEl = document.getElementById('dropoff');
    const updatedAtEl = document.getElementById('updatedAt');

    async function refresh() {
      try {
        const res = await fetch('/deliveries/track/' + encodeURIComponent(trackingCode));
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();

        statusEl.textContent = 'Status: ' + String(data.status || 'UNKNOWN').replaceAll('_', ' ');
        courierEl.textContent = data.courier?.name || 'Not assigned';
        pickupEl.textContent = data.pickupAddress || '-';
        dropoffEl.textContent = data.dropoffAddress || '-';

        if (data.pickupLat && data.pickupLng) {
          if (!pickupMarker) pickupMarker = L.marker([data.pickupLat, data.pickupLng]).addTo(map).bindPopup('Pickup');
          else pickupMarker.setLatLng([data.pickupLat, data.pickupLng]);
        }

        if (data.dropoffLat && data.dropoffLng) {
          if (!dropoffMarker) dropoffMarker = L.marker([data.dropoffLat, data.dropoffLng]).addTo(map).bindPopup('Dropoff');
          else dropoffMarker.setLatLng([data.dropoffLat, data.dropoffLng]);
        }

        const loc = data.trackingPoints && data.trackingPoints[0];
        if (loc && loc.lat && loc.lng) {
          if (!courierMarker) courierMarker = L.marker([loc.lat, loc.lng]).addTo(map).bindPopup('Courier');
          else courierMarker.setLatLng([loc.lat, loc.lng]);
          map.setView([loc.lat, loc.lng], 14);
          updatedAtEl.textContent = 'Live location updated: ' + new Date(loc.createdAt).toLocaleTimeString();
        } else {
          updatedAtEl.textContent = 'Waiting for courier live location...';
        }
      } catch {
        statusEl.textContent = 'Tracking unavailable';
      }
    }

    refresh();
    setInterval(refresh, 8000);
  </script>
</body>
</html>`);
};

// POST /deliveries/:id/rate
export const rateDelivery = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const { rating, comment } = rateDeliverySchema.parse(req.body);

        const delivery = await prisma.delivery.findUnique({ where: { id } });
        if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
        if (delivery.senderId !== userId) return res.status(403).json({ error: 'Only sender can rate' });
        if (delivery.status !== 'DELIVERED' && delivery.status !== 'COMPLETED') {
            return res.status(400).json({ error: 'Can only rate completed deliveries' });
        }

        const updated = await prisma.delivery.update({
            where: { id },
            data: { rating, ratingComment: comment, status: 'COMPLETED' },
        });

        // Update courier average rating
        if (delivery.courierId) {
            const avgResult = await prisma.delivery.aggregate({
                where: { courierId: delivery.courierId, rating: { not: null } },
                _avg: { rating: true },
            });
            if (avgResult._avg.rating) {
                await prisma.courierProfile.update({
                    where: { userId: delivery.courierId },
                    data: { rating: Math.round(avgResult._avg.rating * 10) / 10 },
                });
            }
        }

        res.json(updated);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};
