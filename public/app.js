class SendP2P {
    constructor() {
        this.ws = null;
        this.peerId = null;
        this.peers = new Map();
        this.connections = new Map();
        this.pendingFiles = new Map();
        this.currentTransfer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.heartbeatInterval = null;
        this.initializeElements();
        this.setupEventListeners();
        setTimeout(() => this.connect(), 1000);
    }

    initializeElements() {
        this.elements = {
            connectionStatus: document.getElementById('connection-status'),
            deviceName: document.getElementById('device-name'),
            emptyState: document.getElementById('empty-state'),
            devicesGrid: document.getElementById('devices-grid'),
            fileInput: document.getElementById('file-input'),
            progressModal: document.getElementById('progress-modal'),
            receiveModal: document.getElementById('receive-modal'),
            toastContainer: document.getElementById('toast-container')
        };
    }

    setupEventListeners() {
        this.elements.deviceName.addEventListener('change', (e) => {
            this.setDeviceName(e.target.value);
        });
        this.elements.deviceName.addEventListener('blur', (e) => {
            this.setDeviceName(e.target.value);
        });
        this.elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0 && this.selectedPeer) {
                this.sendFiles(Array.from(e.target.files), this.selectedPeer);
            }
        });
        document.getElementById('cancel-transfer').addEventListener('click', () => {
            this.cancelCurrentTransfer();
        });
        document.getElementById('accept-file').addEventListener('click', () => {
            this.acceptFile();
        });
        document.getElementById('decline-file').addEventListener('click', () => {
            this.declineFile();
        });
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const deviceCard = e.target.closest('.device-card');
            if (deviceCard && e.dataTransfer.files.length > 0) {
                const peerId = deviceCard.dataset.peerId;
                this.sendFiles(Array.from(e.dataTransfer.files), peerId);
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.checkConnection();
            }
        });
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }
        this.updateConnectionStatus('connecting', 'Connecting...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
            this.updateConnectionStatus('connected', 'Connected');
            this.reconnectAttempts = 0;
            this.startHeartbeat();
        };
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error(error);
            }
        };
        this.ws.onclose = (event) => {
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.stopHeartbeat();

            if (event.code !== 1000) {
                this.attemptReconnect();
            }
        };
        this.ws.onerror = (error) => {
            this.updateConnectionStatus('disconnected', 'Connection error');
        };
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showToast('Connection lost. Please refresh the page.', 'error');
            return;
        }
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        setTimeout(() => {
            if (this.ws.readyState === WebSocket.CLOSED) {
                this.connect();
            }
        }, delay);
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'heartbeat-response',
                    timestamp: Date.now()
                }));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    checkConnection() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connect();
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'init':
                this.peerId = message.peerId;
                this.roomId = message.roomId;
                this.elements.deviceName.value = `Device-${this.peerId.slice(0, 6)}`;
                break;
            case 'peers-update':
                this.updatePeersList(message.peers, message.roomInfo);
                break;
            case 'signal':
                this.handleSignal(message.from, message.signal, message.fileInfo);
                break;
            case 'file-request':
                this.showReceiveModal(message.from, message.fromName, message.fileInfo);
                break;
            case 'file-response':
                this.handleFileResponse(message.from, message.accepted, message.fileInfo);
                break;
            case 'heartbeat':
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'heartbeat-response',
                        timestamp: Date.now()
                    }));
                }
                break;
        }
    }

    updateConnectionStatus(status, text) {
        this.elements.connectionStatus.className = `status ${status}`;
        this.elements.connectionStatus.querySelector('.status-text').textContent = text;
    }

    updatePeersList(peers, roomInfo) {
        this.peers.clear();
        if (peers.length === 0) {
            this.elements.emptyState.style.display = 'block';
            this.elements.devicesGrid.style.display = 'none';
            return;
        }
        this.elements.emptyState.style.display = 'none';
        this.elements.devicesGrid.style.display = 'grid';
        this.elements.devicesGrid.innerHTML = '';
        peers.forEach(peer => {
            this.peers.set(peer.peerId, peer);
            this.createDeviceCard(peer);
        });
    }

    createDeviceCard(peer) {
        const card = document.createElement('div');
        card.className = 'device-card fade-in';
        card.dataset.peerId = peer.peerId;
        let deviceIcon = `<img src="icons/device-mobile.svg" class="device-mobile">`;
        if (peer.userAgent) {
            if (peer.userAgent.includes('Mobile') || peer.userAgent.includes('Android')) {
                deviceIcon = `<img src="icons/device-mobile.svg" class="device-mobile">`;
            } else if (peer.userAgent.includes('iPad') || peer.userAgent.includes('Tablet')) {
                deviceIcon = `<img src="icons/device-ipad.svg" class="device-ipad">`;
            } else {
                deviceIcon = `<img src="icons/device-desktop.svg" class="device-desktop">`;
            }
        }
        card.innerHTML = `
            <div class="device-icon">${deviceIcon}</div>
            <div class="device-name">${peer.name}</div>
        `;
        card.addEventListener('click', () => {
            this.selectedPeer = peer.peerId;
            this.elements.fileInput.click();
        });
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', (e) => {
            if (!card.contains(e.relatedTarget)) {
                card.classList.remove('drag-over');
            }
        });
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this.sendFiles(Array.from(e.dataTransfer.files), peer.peerId);
            }
        });
        this.elements.devicesGrid.appendChild(card);
    }

    setDeviceName(name) {
        const deviceName = name?.trim() || `Device-${this.peerId?.slice(0, 6) || 'Unknown'}`;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'set-name',
                name: deviceName
            }));
        }
    }

    async sendFiles(files, targetPeerId) {
        if (files.length === 0) return;
        const file = files[0];
        const fileInfo = {
            name: file.name,
            size: file.size,
            type: file.type,
            id: this.generateId()
        };
        this.ws.send(JSON.stringify({
            type: 'file-request',
            to: targetPeerId,
            fileInfo: fileInfo
        }));
        this.pendingFiles.set(fileInfo.id, { file, targetPeerId });
    }

    handleFileResponse(fromPeerId, accepted, fileInfo) {
        const pendingFile = this.pendingFiles.get(fileInfo.id);
        if (!pendingFile) return;
        if (accepted) {
            this.establishConnection(fromPeerId, pendingFile.file, fileInfo, true);
        } else {
            this.showToast('File transfer declined', 'warning');
            this.pendingFiles.delete(fileInfo.id);
        }
    }

    showReceiveModal(fromPeerId, fromName, fileInfo) {
        this.currentFileRequest = { fromPeerId, fileInfo };
        document.getElementById('receive-filename').textContent = fileInfo.name;
        document.getElementById('receive-filesize').textContent = this.formatFileSize(fileInfo.size);
        document.getElementById('sender-name').textContent = fromName;
        this.elements.receiveModal.style.display = 'flex';
        this.receiveTimeout = setTimeout(() => {
            this.declineFile();
        }, 30000);
    }

    acceptFile() {
        if (this.receiveTimeout) {
            clearTimeout(this.receiveTimeout);
            this.receiveTimeout = null;
        }
        if (this.currentFileRequest) {
            this.ws.send(JSON.stringify({
                type: 'file-response',
                to: this.currentFileRequest.fromPeerId,
                accepted: true,
                fileInfo: this.currentFileRequest.fileInfo
            }));
            this.establishConnection(this.currentFileRequest.fromPeerId, null, this.currentFileRequest.fileInfo, false);
        }
        this.elements.receiveModal.style.display = 'none';
    }

    declineFile() {
        if (this.receiveTimeout) {
            clearTimeout(this.receiveTimeout);
            this.receiveTimeout = null;
        }
        if (this.currentFileRequest) {
            this.ws.send(JSON.stringify({
                type: 'file-response',
                to: this.currentFileRequest.fromPeerId,
                accepted: false,
                fileInfo: this.currentFileRequest.fileInfo
            }));
        }
        this.elements.receiveModal.style.display = 'none';
    }

    async establishConnection(peerId, file, fileInfo, isSender) {
        const connection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        });
        const dataChannel = isSender ?
            connection.createDataChannel('fileTransfer', {
                ordered: true,
                maxRetransmits: 3
            }) : null;
        this.connections.set(peerId, connection);
        if (isSender) {
            this.setupDataChannelSender(dataChannel, file, fileInfo);
            try {
                const offer = await connection.createOffer();
                await connection.setLocalDescription(offer);
                this.ws.send(JSON.stringify({
                    type: 'signal',
                    to: peerId,
                    signal: { type: 'offer', offer: offer },
                    fileInfo: fileInfo
                }));
            } catch (error) {
                this.showToast('Failed to establish connection', 'error');
            }
        } else {
            connection.ondatachannel = (event) => {
                const channel = event.channel;
                this.setupDataChannelReceiver(channel, fileInfo);
            };
        }
        connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
                    type: 'signal',
                    to: peerId,
                    signal: { type: 'ice-candidate', candidate: event.candidate }
                }));
            }
        };
        connection.onconnectionstatechange = () => {
            if (connection.connectionState === 'failed') {
                this.showToast('Connection failed. Please try again.', 'error');
                this.hideProgressModal();
            }
        };
    }

    async handleSignal(fromPeerId, signal, fileInfo) {
        let connection = this.connections.get(fromPeerId);
        try {
            if (signal.type === 'offer') {
                if (!connection) return;
                await connection.setRemoteDescription(signal.offer);
                const answer = await connection.createAnswer();
                await connection.setLocalDescription(answer);
                this.ws.send(JSON.stringify({
                    type: 'signal',
                    to: fromPeerId,
                    signal: { type: 'answer', answer: answer }
                }));
            } else if (signal.type === 'answer') {
                if (connection) {
                    await connection.setRemoteDescription(signal.answer);
                }
            } else if (signal.type === 'ice-candidate') {
                if (connection) {
                    await connection.addIceCandidate(signal.candidate);
                }
            }
        } catch (error) {
            this.showToast('Connection error. Please try again.', 'error');
        }
    }

    setupDataChannelSender(dataChannel, file, fileInfo) {
        dataChannel.onopen = () => {
            this.showProgressModal(fileInfo, true);
            this.sendFileData(dataChannel, file, fileInfo);
        };
        dataChannel.onerror = (error) => {
            this.showToast('File transfer failed', 'error');
            this.hideProgressModal();
        };
        dataChannel.onclose = () => {
            console.error('DataChannel closed during file transfer');
        };
    }

    setupDataChannelReceiver(dataChannel, fileInfo) {
        let receivedData = [];
        let receivedBytes = 0;
        this.showProgressModal(fileInfo, false);
        dataChannel.onmessage = (event) => {
            const data = event.data;
            if (typeof data === 'string') {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'file-end') {
                        this.completeFileReceive(receivedData, fileInfo);
                    }
                } catch (e) {
                    console.error(e);
                }
            } else {
                receivedData.push(data);
                receivedBytes += data.byteLength;
                const progress = (receivedBytes / fileInfo.size) * 100;
                this.updateProgress(progress);
            }
        };
        dataChannel.onerror = (error) => {
            this.showToast('File transfer failed', 'error');
            this.hideProgressModal();
        };
        dataChannel.onclose = () => {
            console.error('DataChannel closed during file transfer');
        };
    }

    async sendFileData(dataChannel, file, fileInfo) {
        const chunkSize = 64 * 1024;
        const maxBufferedAmount = 8 * 1024 * 1024;
        let sentBytes = 0;
        const startTime = Date.now();
        try {
            for (let offset = 0; offset < file.size; offset += chunkSize) {
                const chunk = file.slice(offset, offset + chunkSize);
                const arrayBuffer = await chunk.arrayBuffer();
                while (dataChannel.bufferedAmount > maxBufferedAmount) {
                    if (dataChannel.readyState !== 'open') {
                        throw new Error("DataChannel closed during transfer.");
                    }
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                dataChannel.send(arrayBuffer);
                sentBytes += arrayBuffer.byteLength;
                const progress = (sentBytes / file.size) * 100;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = sentBytes / elapsed;
                this.updateProgress(progress, speed);
                if ((offset / chunkSize) % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
            dataChannel.send(JSON.stringify({ type: 'file-end' }));
            setTimeout(() => {
                this.hideProgressModal();
                this.showToast('File sent successfully!', 'success');
            }, 500);
        } catch (error) {
            this.showToast('File transfer failed', 'error');
            this.hideProgressModal();
        }
    }

    completeFileReceive(receivedData, fileInfo) {
        try {
            const blob = new Blob(receivedData, { type: fileInfo.type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileInfo.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setTimeout(() => {
                this.hideProgressModal();
                this.showToast('File received successfully!', 'success');
            }, 500);
        } catch (error) {
            this.showToast('Error saving file', 'error');
            this.hideProgressModal();
        }
    }

    showProgressModal(fileInfo, isSending) {
        document.getElementById('progress-title').textContent = isSending ? 'Sending File' : 'Receiving File';
        document.getElementById('progress-filename').textContent = fileInfo.name;
        document.getElementById('progress-filesize').textContent = this.formatFileSize(fileInfo.size);
        this.updateProgress(0);
        this.elements.progressModal.style.display = 'flex';
        this.currentTransfer = { fileInfo, isSending };
    }

    hideProgressModal() {
        this.elements.progressModal.style.display = 'none';
        this.currentTransfer = null;
    }

    updateProgress(percent, speed = 0) {
        const fill = document.getElementById('progress-fill');
        const percentEl = document.getElementById('progress-percent');
        const speedEl = document.getElementById('progress-speed');
        if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        if (percentEl) percentEl.textContent = `${Math.round(Math.min(100, Math.max(0, percent)))}%`;
        if (speedEl && speed > 0) speedEl.textContent = `${this.formatFileSize(speed)}/s`;
    }

    cancelCurrentTransfer() {
        if (this.currentTransfer) {
            this.connections.forEach(connection => {
                connection.close();
            });
            this.connections.clear();
            this.hideProgressModal();
            this.showToast('Transfer cancelled', 'warning');
        }
    }

    showToast(message, type = 'info') {
        const importantTypes = ['error', 'warning'];
        const successMessages = ['File sent successfully!', 'File received successfully!'];
        if (!importantTypes.includes(type) && !successMessages.includes(message)) {
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
        <div class="toast-message">${message}</div>`;
        this.elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 4000);
        const toasts = this.elements.toastContainer.querySelectorAll('.toast');
        if (toasts.length > 2) {
            toasts[0].remove();
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SendP2P();
});

window.addEventListener('beforeunload', () => {
    if (window.SendP2P && window.SendP2P.ws) {
        window.SendP2P.ws.close();
    }
});