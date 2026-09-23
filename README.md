# WikiLinker

<p align="center">
  <img src="wikilinker-mobile/assets/icon.png" alt="WikiLinker app icon" width="144" />
</p>

WikiLinker is a Wikipedia navigation game. Players begin on one English Wikipedia article and race to a target article using only the links available on each page. The goal is to find the destination with fewer clicks and a faster time.

The repository contains the Expo mobile application and the real-time multiplayer service.

## Features

- Solo races with preset, random, and custom article routes
- Real-time multiplayer lobbies for up to eight racers
- Private room codes and host-controlled race settings
- Route history, completion time, and click-count results
- Personal records and unlockable accolades stored on-device
- Light and dark themes
- Direct navigation through live English Wikipedia content

## Technology

### Mobile application

- Expo SDK 54
- React 19 and React Native 0.81
- React Native WebView
- Socket.IO Client
- AsyncStorage
- Wikipedia REST and MediaWiki APIs

### Multiplayer service

- Node.js
- Express
- Socket.IO
- In-memory private race rooms

## Repository structure

```text
.
├── wikilinker-mobile/   Expo mobile application
└── wikilinker-server/   Real-time multiplayer service
```

## Running locally

### Prerequisites

- Node.js and npm
- An Expo-compatible iOS or Android development environment

### Start the multiplayer service

```bash
cd wikilinker-server
npm install
npm start
```

The service listens on port `3000` by default. Hosting platforms can provide a different port through the `PORT` environment variable.

### Start the mobile application

```bash
cd wikilinker-mobile
npm install
```

For local multiplayer testing on a physical device, create `wikilinker-mobile/.env` and point the app to the development machine's LAN address:

```dotenv
EXPO_PUBLIC_WIKILINKER_SERVER=http://192.168.1.100:3000
```

Then start Expo:

```bash
npm start
```

The committed default connects production builds to the deployed WikiLinker multiplayer service. Local `.env` files are intentionally excluded from Git.

## How multiplayer works

1. A host creates a private room and receives a four-character room code.
2. Other players join with the room code and a display name.
3. The host selects or edits the starting and target articles.
4. Each racer follows Wikipedia links toward the target while the service synchronizes race progress.

Room state is temporary and held in memory. WikiLinker does not require user accounts, subscriptions, or payments.

## External content

WikiLinker retrieves publicly available content from English Wikipedia through Wikimedia APIs. WikiLinker is not affiliated with or endorsed by the Wikimedia Foundation. Wikipedia content remains subject to its applicable licenses and the [Wikimedia Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use).

## License

The WikiLinker project is available under the [MIT License](LICENSE). Third-party software and template components remain subject to their respective licenses and notices.
