import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';

export function useDeepLinking(onJoinLobby) {
  const [initialUrl, setInitialUrl] = useState(null);
  const incomingUrl = Linking.useLinkingURL();

  useEffect(() => {
    if (incomingUrl) {
      handleUrl(incomingUrl);
    }
  }, [incomingUrl]);

  useEffect(() => {
    async function getInitialUrl() {
      const url = await Linking.getInitialURL();
      if (url) {
        setInitialUrl(url);
        handleUrl(url);
      }
    }
    getInitialUrl();
  }, []);

  const handleUrl = (url) => {
    if (!url) return;

    try {
      const parsed = Linking.parse(url);
      console.log('🔗 Incoming Link Parsed:', JSON.stringify(parsed, null, 2));

      const path = parsed.path;
      const queryParams = parsed.queryParams;

      let lobbyCode = null;

      if (path && path.startsWith('lobby/')) {
        lobbyCode = path.split('/')[1];
      } else if (queryParams && queryParams.code) {
        lobbyCode = queryParams.code;
      }

      if (lobbyCode) {
        const cleanCode = lobbyCode.toUpperCase().trim();
        console.log(`🎯 Linking system intercepted join action. Lobby code: ${cleanCode}`);
        if (onJoinLobby) {
          onJoinLobby(cleanCode);
        }
      }
    } catch (error) {
      console.error('❌ Could not parse incoming deep link:', error);
    }
  };

  return { initialUrl };
}
