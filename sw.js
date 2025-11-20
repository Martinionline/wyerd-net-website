// Service Worker to handle API routes on wyerd.net - v2025.11.19
// This intercepts /api/* requests and forwards to MongoDB backend

const CACHE_NAME = 'wyerd-crm-v2';
const PRIMARY_BACKEND = 'https://expert-fishstick-7vwj9x9vj6r93wqqp-5173.app.github.dev';
const FALLBACK_BACKENDS = [
  'https://expert-fishstick-7vwj9x9vj6r93wqqp-5000.app.github.dev',
  'https://facilitate-dim-insight-writes.trycloudflare.com'
];

console.log('🚀 Service Worker v2025.11.19 loading - Multiple Backend Fallbacks');
console.log('🎯 Primary Backend:', PRIMARY_BACKEND);
console.log('🔄 Fallback Backends:', FALLBACK_BACKENDS);

// Install service worker
self.addEventListener('install', (event) => {
  console.log('🔧 WyerdCRM Service Worker v2025.11.19 installing...');
  console.log('⚡ Forcing immediate activation to clear old cached version');
  self.skipWaiting();
});

// Activate service worker
self.addEventListener('activate', (event) => {
  console.log('✅ WyerdCRM Service Worker v2025.11.19 activated - Multiple Backends');
  console.log('🔗 Primary Backend:', PRIMARY_BACKEND);
  
  // Clear old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    }).then(() => {
      return clients.claim();
    })
  );
});

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Handle API routes
  if (url.pathname.startsWith('/api/')) {
    console.log('🔗 Intercepting API request:', url.pathname);
    console.log('📡 Will try multiple backends starting with:', PRIMARY_BACKEND);
    
    event.respondWith(
      handleApiRequest(event.request)
        .catch(error => {
          console.error('API request failed:', error);
          return new Response(
            JSON.stringify({ error: 'API request failed', message: error.message }), 
            { 
              status: 500, 
              headers: { 'Content-Type': 'application/json' } 
            }
          );
        })
    );
    return;
  }
  
  // For non-API requests, use default fetch
  event.respondWith(fetch(event.request));
});

// Handle API requests - connect directly to backend API server
async function handleApiRequest(request) {
  const backendUrls = [
    PRIMARY_BACKEND, // Try localhost:5173 first (development server)
    ...FALLBACK_BACKENDS // Then try other backends
  ];
  
  const url = new URL(request.url);
  console.log('🔗 Handling API request:', url.pathname);
  console.log('🎯 Will try backends:', backendUrls);
  
  let lastError = null;
  
  // Try each backend URL
  for (let i = 0; i < backendUrls.length; i++) {
    const backendUrl = backendUrls[i];
    try {
      const fullBackendUrl = `${backendUrl}${url.pathname}${url.search}`;
      console.log(`📡 Attempt ${i + 1}/${backendUrls.length}: ${fullBackendUrl}`);
      
      // Clone the request but change the URL with proper headers
      const requestHeaders = new Headers();
      
      // Copy original headers
      for (const [key, value] of request.headers.entries()) {
        requestHeaders.set(key, value);
      }
      
      // Don't override origin for Codespace URLs - let them be natural
      if (backendUrl.includes('app.github.dev')) {
        // Remove origin header to let browser set it naturally
        requestHeaders.delete('Origin');
        console.log('🏗️  Using natural origin for Codespace backend');
      } else {
        requestHeaders.set('Origin', 'https://wyerd.net');
        console.log('🌐 Using wyerd.net origin for external backend');
      }
      
      const backendRequest = new Request(fullBackendUrl, {
        method: request.method,
        headers: requestHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().text() : null,
        credentials: 'include',
        mode: 'cors'
      });
      
      // Make request to backend with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(backendRequest, { 
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      
      console.log(`✅ Backend ${i + 1} responded:`, response.status, response.statusText);
      
      // Success - return the response with proper CORS headers
      const responseBody = await response.text();
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://wyerd.net',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Allow-Credentials': 'true'
        }
      });
      
    } catch (error) {
      lastError = error;
      console.log(`❌ Backend ${i + 1} failed:`, error.message);
      
      // If this isn't the last backend, try the next one
      if (i < backendUrls.length - 1) {
        console.log('🔄 Trying next backend...');
        continue;
      }
    }
  }
  
  // All backends failed
  console.error('❌ CRITICAL: All backends failed');
  console.error('🔧 Last error:', lastError?.message);
  console.error('📋 Backends tried:', backendUrls);
  
  return new Response(JSON.stringify({
    error: 'All Backends Failed',
    message: 'Unable to connect to any backend server. Check if development server is running.',
    backends: backendUrls,
    lastError: lastError?.message || 'Unknown error',
    solutions: [
      'Start dev server: npm run dev (port 5173)',
      'Start backend: node server.js (http://localhost:5000)', 
      'Check CORS configuration',
      'Verify MongoDB connection'
    ],
    timestamp: new Date().toISOString()
  }), {
    status: 503,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}