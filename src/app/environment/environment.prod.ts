export const environment = {
  production: true,
  apiUrl: 'https://halqa-api-k60w.onrender.com',
  // IMPORTANT: This must point to the deployed Scheduling Service base URL.
  // If left empty, /v1 calls will be made relative to the frontend origin.
  schedulingApiUrl: '',
  name: 'production',
  stripePublicKey:
    'pk_live_51S65m5HWyWU8XSUQkRKEllSAb1Bc7cv0C5CgmBjgroQi28bgD6IrkgJUscG6eHJoRdqz3h92xsLVmeo05zoiRfOl001cqYDHud',
};
