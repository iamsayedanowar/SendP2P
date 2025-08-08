const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const os = require('os');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const peers = new Map();
const rooms = new Map();
const FORCE_SAME_ROOM = true;
const DEFAULT_ROOM = 'room_main';

class Peer {
    constructor(socket, peerId) {
        this.socket = socket;
        this.peerId = peerId;
        this.roomId = null;
        this.name = `Device-${peerId.slice(0, 6)}`;
        this.ip = null;
        this.userAgent = null;
        this.connectedAt = new Date();
    }

    send(message) {
        if (this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                console.error(error);
            }
        }
    }
}

class Room {
    constructor(roomId) {
        this.id = roomId;
        this.peers = new Set();
        this.createdAt = new Date();
    }

    addPeer(peer) {
        this.peers.add(peer);
        peer.roomId = this.id;
        this.broadcastPeerList();
    }

    removePeer(peer) {
        this.peers.delete(peer);
        peer.roomId = null;
        if (this.peers.size === 0) {
            rooms.delete(this.id);
        } else {
            this.broadcastPeerList();
        }
    }

    broadcastPeerList() {
        const peerList = Array.from(this.peers).map(peer => ({
            peerId: peer.peerId,
            name: peer.name,
            ip: peer.ip,
            userAgent: peer.userAgent
        }));
        this.peers.forEach(peer => {
            const otherPeers = peerList.filter(p => p.peerId !== peer.peerId);
            peer.send({
                type: 'peers-update',
                peers: otherPeers,
                roomInfo: {
                    roomId: this.id,
                    totalPeers: this.peers.size,
                    myInfo: {
                        peerId: peer.peerId,
                        name: peer.name,
                        ip: peer.ip
                    }
                }
            });
        });
    }
}

function getRoomId(ip, userAgent) {
    if (FORCE_SAME_ROOM) {
        return DEFAULT_ROOM;
    }
    const cleanIP = ip.replace(/^::ffff:/, '');
    if (cleanIP.includes('.')) {
        const parts = cleanIP.split('.');
        if (parts.length >= 3) {
            return 'room_' + parts.slice(0, 3).join('_');
        }
    }
    return DEFAULT_ROOM;
}

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const remoteAddr = req.connection.remoteAddress || req.socket.remoteAddress;
    const ip = (forwarded && forwarded.split(',')[0].trim()) ||
        realIp ||
        remoteAddr ||
        '127.0.0.1';
    return ip.replace(/^::ffff:/, '');
}

app.get('/api/test', (req, res) => {
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const roomId = getRoomId(clientIP, userAgent);
    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        client: {
            ip: clientIP,
            userAgent: userAgent
        },
        server: {
            connectedPeers: peers.size,
            activeRooms: rooms.size
        },
        assignment: {
            roomId: roomId,
            forcedRoom: FORCE_SAME_ROOM
        }
    });
});

app.get('/api/rooms', (req, res) => {
    const roomData = Array.from(rooms.entries()).map(([id, room]) => ({
        id,
        peerCount: room.peers.size,
        createdAt: room.createdAt,
        peers: Array.from(room.peers).map(p => ({
            peerId: p.peerId,
            name: p.name,
            ip: p.ip,
            connectedAt: p.connectedAt
        }))
    }));
    res.json({
        totalRooms: rooms.size,
        totalPeers: peers.size,
        rooms: roomData
    });
});

wss.on('connection', (socket, request) => {
    const peerId = uuidv4();
    const clientIP = getClientIP(request);
    const userAgent = request.headers['user-agent'] || 'Unknown';
    const roomId = getRoomId(clientIP, userAgent);
    const peer = new Peer(socket, peerId);
    peer.ip = clientIP;
    peer.userAgent = userAgent;
    peers.set(peerId, peer);
    let room = rooms.get(roomId);
    if (!room) {
        room = new Room(roomId);
        rooms.set(roomId, room);
    }
    room.addPeer(peer);
    peer.send({
        type: 'init',
        peerId: peerId,
        roomId: roomId,
        serverTime: new Date().toISOString()
    });
    socket.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(peer, message);
        } catch (error) {
            console.error(error);
        }
    });
    socket.on('close', () => {
        if (peer.roomId) {
            const room = rooms.get(peer.roomId);
            if (room) {
                room.removePeer(peer);
            }
        }
        peers.delete(peerId);
    });
    socket.on('error', (error) => {
        console.error(error);
    });
    const statusInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            peer.send({
                type: 'status-update',
                roomPeers: room.peers.size,
                totalPeers: peers.size,
                timestamp: Date.now()
            });
        } else {
            clearInterval(statusInterval);
        }
    }, 30000);
});

function handleMessage(sender, message) {
    const room = rooms.get(sender.roomId);
    if (!room) return;
    switch (message.type) {
        case 'set-name':
            sender.name = message.name || `Device-${sender.peerId.slice(0, 6)}`;
            room.broadcastPeerList();
            break;
        case 'signal':
            const targetPeer = peers.get(message.to);
            if (targetPeer && targetPeer.roomId === sender.roomId) {
                targetPeer.send({
                    type: 'signal',
                    from: sender.peerId,
                    signal: message.signal,
                    fileInfo: message.fileInfo
                });
            }
            break;
        case 'file-request':
            const receiverPeer = peers.get(message.to);
            if (receiverPeer && receiverPeer.roomId === sender.roomId) {
                receiverPeer.send({
                    type: 'file-request',
                    from: sender.peerId,
                    fromName: sender.name,
                    fileInfo: message.fileInfo
                });
            }
            break;
        case 'file-response':
            const requesterPeer = peers.get(message.to);
            if (requesterPeer && requesterPeer.roomId === sender.roomId) {
                requesterPeer.send({
                    type: 'file-response',
                    from: sender.peerId,
                    accepted: message.accepted,
                    fileInfo: message.fileInfo
                });
            }
            break;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();
    console.log('Server running on:');
    console.log(`  Local: http://localhost:${PORT}`);
    Object.entries(interfaces).forEach(([name, nets]) => {
        nets.forEach(net => {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`  Network: http://${net.address}:${PORT}`);
            }
        });
    });
});

process.on('SIGTERM', () => {
    server.close(() => {
        process.exit(0);
    });
});