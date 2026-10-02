# Photon Integration Guide

Photon runs multiplayer transport; this backend stores player identity/data and can prepare auth payloads. It does not replace Photon Realtime, Fusion, or Voice servers.

## Overview

This backend provides authentication tokens for Photon services but does not replace Photon servers. You must configure Photon applications separately and integrate them with this backend's authentication flow.

## Configuration

Configure separate values in Render/API environment:

- `PHOTON_REALTIME_APP_ID`: Photon Realtime or applicable Fusion app
- `PHOTON_VOICE_APP_ID`: Photon Voice app (must be distinct and independently configured)
- `PHOTON_REGION`: region code selected for the app (e.g., `us`, `eu`, `asia`)
- `PHOTON_APP_VERSION`: client/server matchmaking version (e.g., `1.0.0`)

**Important**: The Realtime and Voice App IDs must be from separate Photon applications. Never use the same App ID for both services.

## Photon Dashboard Setup

### 1. Create Photon Applications

1. Log into the [Photon Dashboard](https://dashboard.photonengine.com)
2. Create a new application for **Photon Realtime** (or Fusion)
3. Create a separate new application for **Photon Voice**
4. Note each App ID - these are public identifiers

### 2. Configure Custom Authentication (Optional but Recommended)

For secure authentication, configure Photon Custom Authentication:

#### Option A: Photon Custom Authentication v2

1. In your Photon application settings, enable Custom Authentication
2. Set the authentication URL to your backend endpoint:
   - For Realtime: `https://your-api-domain.com/api/v1/photon/realtime/auth`
   - For Voice: `https://your-api-domain.com/api/v1/photon/voice/auth`
3. Configure the authentication type as "Custom" or "External"
4. Set up the authentication parameters that Photon will send to your backend

#### Option B: Client-Side Token Validation

If not using Photon's Custom Authentication service:
1. The Unity SDK will receive an auth token from this backend
2. Pass this token to Photon's authentication API
3. Implement server-side validation in your Photon server code (if using Photon Server)

### 3. Set Regions

1. In Photon Dashboard, select the regions you want to support
2. Match the `PHOTON_REGION` environment variable to your primary region
3. Consider implementing region selection in your Unity client based on player location

## Backend Authentication Flow

### Step 1: Player Authenticates with Backend

```csharp
// Unity SDK
var authResult = await rayvoClient.LoginRayvoCustomIDNoPCVR(customId, customSecret);
```

### Step 2: Request Photon Authentication Data

```csharp
// For Realtime
var realtimeAuth = await rayvoClient.GetPhotonAuthenticationData();

// For Voice (separate call)
var voiceAuth = await rayvoClient.GetPhotonVoiceAuthenticationData();
```

### Step 3: Connect to Photon

```csharp
// Photon Realtime
PhotonNetwork.AuthValues = new AuthenticationValues();
PhotonNetwork.AuthValues.UserId = realtimeAuth.UserId;
PhotonNetwork.AuthValues.AuthType = CustomAuthType.Custom;
PhotonNetwork.AuthValues.AddAuthParameter("token", realtimeAuth.AuthToken);
PhotonNetwork.ConnectUsingSettings();
PhotonNetwork.PhotonServerSettings.AppID = realtimeAuth.AppId;
PhotonNetwork.PhotonServerSettings.FixedRegion = realtimeAuth.Region;

// Photon Voice (separate initialization)
VoiceClient.AuthValues = new AuthenticationValues();
VoiceClient.AuthValues.UserId = voiceAuth.UserId;
VoiceClient.AuthValues.AuthType = CustomAuthType.Custom;
VoiceClient.AuthValues.AddAuthParameter("token", voiceAuth.AuthToken);
VoiceClient.ConnectUsingSettings();
VoiceClient.PhotonServerSettings.AppID = voiceAuth.AppId;
```

## Unity SDK Integration

The Unity SDK (`unity-sdk/RayvoSDK/`) includes methods for Photon authentication:

- `GetPhotonAuthenticationData()`: Returns Realtime auth payload
- `GetPhotonVoiceAuthenticationData()`: Returns Voice auth payload

Each returns:
- `appId`: The configured Photon App ID
- `userId`: Unique player identifier for Photon
- `authToken`: Signed token for authentication
- `region`: Configured region
- `appVersion`: Configured app version

## Fusion-Specific Notes

Fusion uses different authentication APIs depending on the version:

### Fusion 2.0+

```csharp
var authResult = await rayvoClient.GetPhotonAuthenticationData();
var customAuthArgs = new Dictionary<string, object> {
    { "token", authResult.AuthToken }
};

var networkRunner = new NetworkRunner();
var startArgs = new StartGameArgs {
    GameMode = GameMode.Shared,
    AuthValues = new AuthenticationValues {
        UserId = authResult.UserId,
        AuthType = CustomAuthType.Custom,
    },
    CustomAuthenticationData = authResult.AuthToken,
    // ... other args
};

await networkRunner.StartGame(startArgs);
```

### Legacy Fusion

Follow the Photon Realtime authentication pattern above, adapting to Fusion's specific API.

## Security Considerations

1. **Never expose backend secrets in Unity**: Only public App IDs and authentication tokens go to the client
2. **Token validation**: Configure Photon to validate tokens issued by this backend
3. **Separate credentials**: Use different signing secrets for Realtime and Voice
4. **Region enforcement**: Validate that clients connect to allowed regions
5. **Rate limiting**: The backend implements rate limiting on auth endpoints

## Testing Checklist

Before deploying to production:

- [ ] Create separate Photon Realtime and Voice applications
- [ ] Configure environment variables with correct App IDs
- [ ] Test authentication flow end-to-end in development
- [ ] Verify token validation in Photon dashboard
- [ ] Test region selection and connectivity
- [ ] Test Voice and Realtime independently
- [ ] Verify Fusion integration (if using Fusion)
- [ ] Test error handling for invalid/expired tokens
- [ ] Test with multiple simultaneous players
- [ ] Verify admin dashboard Photon configuration page works

## Troubleshooting

### Authentication Fails

- Verify App IDs match between backend and Photon dashboard
- Check that `PHOTON_REALTIME_APP_ID` and `PHOTON_VOICE_APP_ID` are set correctly
- Ensure the player is authenticated with the backend before requesting Photon auth
- Check backend logs for authentication errors

### Voice Not Working

- Confirm `PHOTON_VOICE_APP_ID` is separate from Realtime App ID
- Verify Voice application is active in Photon dashboard
- Check that Voice client initialization uses the correct App ID

### Region Issues

- Verify `PHOTON_REGION` matches a valid Photon region code
- Test connectivity to the selected region
- Consider implementing fallback region selection in Unity

### Token Validation Errors

- Ensure Photon Custom Authentication is configured correctly
- Check that the authentication URL points to your backend
- Verify the backend is accessible from Photon's servers
- Check signing secrets match between backend and Photon configuration

## Provider-Side Configuration Summary

This backend provides the authentication foundation, but complete Photon integration requires:

1. **Photon Dashboard Setup**: Create and configure applications
2. **Custom Authentication**: Configure Photon to validate backend tokens
3. **Unity Integration**: Use SDK methods to obtain and use auth data
4. **Testing**: Validate the full authentication flow before production

The backend cannot create rooms on Photon or enforce room-side mute/ban state without corresponding Photon-side/client integration. Those features must be implemented through Photon's server SDK or room properties.
