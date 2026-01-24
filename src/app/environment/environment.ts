// This file will be replaced during build with environment.prod.ts for production
export const environment = {
  production: false,
  // In development, use same-origin + dev-server proxy (see proxy.conf.json)
  apiUrl: '',
  // Optional: full base URL for SignalR hubs (e.g. https://api.example.com).
  // Leave empty to use same-origin (/hubs/*).
  notificationsHubUrl: '',
  // Optional: separate base URL for Scheduling V1 API (/v1). Leave empty in dev to use proxy.
  schedulingApiUrl: '',
  // Optional: separate base URL for V2 APIs (/v2). Leave empty to use same-origin.
  v2ApiUrl: '',
  name: 'development',
  stripePublicKey:
    'pk_live_51S65m5HWyWU8XSUQkRKEllSAb1Bc7cv0C5CgmBjgroQi28bgD6IrkgJUscG6eHJoRdqz3h92xsLVmeo05zoiRfOl001cqYDHud',

  // Feature flags (V2 - Available Lessons / Trial / Credits-only booking)
  features: {
    v2AvailableLessons: false,
    v2Trial: false,
  },

  googleAds: {
    adsId: 'AW-17893648867',
    conversionSendTo: 'AW-17893648867/cHYpCMr2t-sbEOPTrdRC',
  },
};
