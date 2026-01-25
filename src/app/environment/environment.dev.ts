export const environment = {
  production: false,
  // In development, use same-origin + dev-server proxy (see proxy.conf.json)
  apiUrl: '',
  // Optional: separate base URL for Scheduling V1 API (/v1). Leave empty in dev to use proxy.
  schedulingApiUrl: '',
  name: 'development',
  stripePublicKey:
    'pk_live_51S65m5HWyWU8XSUQkRKEllSAb1Bc7cv0C5CgmBjgroQi28bgD6IrkgJUscG6eHJoRdqz3h92xsLVmeo05zoiRfOl001cqYDHud',
  googleAds: {
    adsId: 'AW-17893648867',
    conversionSendTo: 'AW-17893648867/cHYpCMr2t-sbEOPTrdRC',
      purchaseEventName: 'ads_conversion_Purchase_1',
