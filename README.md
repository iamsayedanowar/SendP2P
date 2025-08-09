![SendP2P](https://raw.githubusercontent.com/iamsayedanowar/SendP2P/refs/heads/main/GRP.png)

# SendP2P

A web-based peer-to-peer file sharing application that allows users to share files directly between devices on the same network without requiring file uploads to a server.

## Setup Instructions

1. Clone the repository:

   ```bash
   https://github.com/iamsayedanowar/SendP2P.git
   ```
2. Install dependencies:

   ```bash
   npm install
   ```
3. Start the server:

   ```bash
   npm run dev
   # or
   npm start
   ```

## Features

- **Real-time Device Discovery:** Automatically discovers devices on the same network.
- **No File Storage:** Files never touch the server - true peer-to-peer sharing.
- **Drag & Drop Support:** Easy file sharing with drag and drop interface.
- **Transfer Progress:** Real-time progress indicators for file transfers.
- **Mobile Friendly:** Works on both desktop and mobile devices.

## Tech Stack

**Front-End :** HTML, CSS, JavaScript

**Back-End :** Node.js, WebSocket

**P2P Technology:** WebRTC

## Usage Tips

- **Keep Devices Awake:** For mobile devices, keep the screen on during file transfers to prevent connection issues.
- **Same Network:** All devices must be connected to the same local network.
- **Firewall:** Ensure your firewall allows WebRTC connections.