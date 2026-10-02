using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace Rayvo.SDK
{
    /// <summary>
    /// Rayvo Game Backend SDK for Unity.
    /// Connect to your self-hosted Rayvo backend for player accounts, data, economy, and Photon auth.
    /// </summary>
    public class RayvoClient
    {
        public static RayvoClient Instance { get; private set; }

        private readonly string _baseUrl;
        private string _accessToken;
        private string _refreshToken;
        private int _requestTimeoutSeconds = 30;
        private int _maxRetries = 3;

        public RayvoPlayer CurrentPlayer { get; private set; }
        public bool IsLoggedIn => !string.IsNullOrEmpty(_accessToken);

        public event Action<RayvoPlayer> OnLoginSuccess;
        public event Action<RayvoError> OnLoginFailed;
        public event Action<RayvoError> OnError;
        public event Action OnLogout;

        public RayvoClient(string baseUrl, int requestTimeoutSeconds = 30)
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _requestTimeoutSeconds = requestTimeoutSeconds;
            Instance = this;
        }

        /// <summary>
        /// Set the maximum number of retries for transient errors (5xx, network issues).
        /// </summary>
        public void SetMaxRetries(int maxRetries)
        {
            _maxRetries = Mathf.Max(0, maxRetries);
        }

        /// <summary>
        /// Login with a custom player ID and a private, randomly generated credential.
        /// Persist the credential in platform secure storage; never use the custom ID as the credential.
        /// </summary>
        public async Task<RayvoAuthResult> LoginRayvoCustomIDNoPCVR(string customId, string customSecret, string displayName = null, bool createAccount = true)
        {
            if (string.IsNullOrEmpty(customId) || customId.Length < 3 || customId.Length > 128)
                throw new RayvoValidationException("Custom ID must be between 3 and 128 characters");
            
            if (string.IsNullOrEmpty(customSecret) || customSecret.Length < 32 || customSecret.Length > 256)
                throw new RayvoValidationException("Custom secret must be between 32 and 256 characters");

            var body = new Dictionary<string, object>
            {
                { "customId", customId },
                { "customSecret", customSecret },
                { "createAccount", createAccount }
            };
            if (!string.IsNullOrEmpty(displayName))
                body["displayName"] = displayName;

            RayvoResponse<RayvoAuthResult> response;
            try
            {
                response = await PostWithRetry<RayvoAuthResult>("/auth/LoginRayvoCustomIDNoPCVR", body);
            }
            catch (RayvoException error)
            {
                var rayvoError = new RayvoError(error.Code, error.Message);
                OnLoginFailed?.Invoke(rayvoError);
                OnError?.Invoke(rayvoError);
                throw;
            }
            catch (Exception error)
            {
                var rayvoError = new RayvoError("NETWORK_ERROR", error.Message);
                OnLoginFailed?.Invoke(rayvoError);
                OnError?.Invoke(rayvoError);
                throw new RayvoException(rayvoError.Message, rayvoError.Code);
            }

            if (response.success)
            {
                _accessToken = response.data.accessToken;
                _refreshToken = response.data.refreshToken;
                CurrentPlayer = response.data.player;
                OnLoginSuccess?.Invoke(CurrentPlayer);
                return response.data;
            }

            var errorResponse = new RayvoError(response.error?.code ?? "UNKNOWN_ERROR", response.error?.message ?? "Login failed");
            OnLoginFailed?.Invoke(errorResponse);
            OnError?.Invoke(errorResponse);
            throw new RayvoException(errorResponse.Message, errorResponse.Code);
        }

        public async Task<RayvoAuthResult> LoginGuest(string displayName = null)
        {
            var body = new Dictionary<string, object>();
            if (!string.IsNullOrEmpty(displayName))
                body["displayName"] = displayName;

            var response = await Post<RayvoAuthResult>("/auth/guest", body);
            if (response.success)
            {
                _accessToken = response.data.accessToken;
                _refreshToken = response.data.refreshToken;
                CurrentPlayer = response.data.player;
                OnLoginSuccess?.Invoke(CurrentPlayer);
                return response.data;
            }
            throw new RayvoException(response.error?.message ?? "Guest login failed");
        }

        public async Task Logout()
        {
            try
            {
                if (IsLoggedIn)
                    await Post<object>("/auth/logout", new { refreshToken = _refreshToken }, authenticated: true);
            }
            finally
            {
                _accessToken = null;
                _refreshToken = null;
                CurrentPlayer = null;
                OnLogout?.Invoke();
            }
        }

        /// <summary>Rotate the current refresh token and replace both local session tokens.</summary>
        public async Task RefreshSession()
        {
            if (string.IsNullOrEmpty(_refreshToken))
                throw new RayvoException("No refresh token is available");

            var response = await Post<RayvoRefreshResult>("/auth/refresh", new { refreshToken = _refreshToken });
            if (!response.success || response.data == null)
                throw new RayvoException(response.error?.message ?? "Session refresh failed");
            _accessToken = response.data.accessToken;
            _refreshToken = response.data.refreshToken;
        }

        public async Task<RayvoPlayerProfile> GetPlayerProfile()
        {
            var response = await Get<RayvoPlayerProfile>("/player/profile", authenticated: true);
            return response.data;
        }

        public async Task<List<RayvoPlayerData>> GetPlayerData(string[] keys = null)
        {
            var url = "/player/data";
            if (keys != null && keys.Length > 0)
                url += "?keys=" + string.Join(",", keys);

            var response = await Get<List<RayvoPlayerData>>(url, authenticated: true);
            return response.data;
        }

        public async Task<RayvoDataUpdateResult> UpdatePlayerData(Dictionary<string, RayvoDataEntry> data)
        {
            var response = await Put<RayvoDataUpdateResult>("/player/data", new { data }, authenticated: true);
            return response.data;
        }

        public async Task<List<RayvoInventoryItem>> GetInventory()
        {
            var response = await Get<List<RayvoInventoryItem>>("/economy/inventory", authenticated: true);
            return response.data;
        }

        public async Task<List<RayvoCurrencyBalance>> GetCurrencyBalance(string currencyCode = null)
        {
            var url = "/economy/currency";
            if (!string.IsNullOrEmpty(currencyCode))
                url += "?currencyCode=" + currencyCode;

            var response = await Get<List<RayvoCurrencyBalance>>(url, authenticated: true);
            return response.data;
        }

        public async Task<List<RayvoStatistic>> GetPlayerStatistics(string[] statKeys = null)
        {
            var url = "/player/statistics";
            if (statKeys != null && statKeys.Length > 0)
                url += "?statKeys=" + string.Join(",", statKeys);

            var response = await Get<List<RayvoStatistic>>(url, authenticated: true);
            return response.data;
        }

        /// <summary>
        /// This player-authenticated call is rejected by the backend because clients cannot
        /// authoritatively change statistics. Send updates from a trusted server instead.
        /// </summary>
        [Obsolete("Client statistic writes are disabled; send updates from a trusted game server.")]
        public async Task<List<RayvoStatistic>> UpdatePlayerStatistics(List<RayvoStatUpdate> statistics)
        {
            var response = await Put<List<RayvoStatistic>>("/player/statistics", new { statistics }, authenticated: true);
            return response.data;
        }

        public async Task<RayvoLeaderboardResult> GetLeaderboard(string leaderboardId, int limit = 100, int offset = 0)
        {
            var url = $"/leaderboards/{leaderboardId}?limit={limit}&offset={offset}";
            var response = await Get<RayvoLeaderboardResult>(url);
            return response.data;
        }

        public async Task<List<RayvoAchievement>> GetAchievements()
        {
            var response = await Get<List<RayvoAchievement>>("/achievements", authenticated: true);
            return response.data;
        }

        public async Task<List<RayvoFriend>> GetFriends()
        {
            var response = await Get<List<RayvoFriend>>("/social/friends", authenticated: true);
            return response.data;
        }

        public async Task<RayvoMatchmakingTicket> CreateMatchmakingTicket(string queueName, RayvoMatchmakingOptions options = null)
        {
            var body = new Dictionary<string, object> { { "queueName", queueName } };
            if (options != null)
            {
                if (options.SkillRating.HasValue) body["skillRating"] = options.SkillRating.Value;
                if (!string.IsNullOrEmpty(options.Region)) body["region"] = options.Region;
            }

            var response = await Post<RayvoMatchmakingTicket>("/matchmaking/ticket", body, authenticated: true);
            return response.data;
        }

        public async Task CancelMatchmakingTicket(string ticketId)
        {
            await Delete($"/matchmaking/ticket/{ticketId}", authenticated: true);
        }

        public async Task<RayvoMatchmakingTicketStatus> GetMatchmakingTicket(string ticketId)
        {
            var response = await Get<RayvoMatchmakingTicketStatus>($"/matchmaking/ticket/{ticketId}", authenticated: true);
            return response.data;
        }

        /// <summary>
        /// Get Photon Realtime authentication data. Use PHOTON_REALTIME_APP_ID - NOT the Voice App ID.
        /// </summary>
        public async Task<RayvoPhotonAuthData> GetPhotonAuthenticationData()
        {
            var response = await Get<RayvoPhotonAuthData>("/photon/realtime/auth", authenticated: true);
            return response.data;
        }

        /// <summary>
        /// Get Photon Voice authentication data. Uses separate PHOTON_VOICE_APP_ID.
        /// Initialize Photon Voice separately from Photon Realtime.
        /// </summary>
        public async Task<RayvoPhotonAuthData> GetPhotonVoiceAuthenticationData()
        {
            var response = await Get<RayvoPhotonAuthData>("/photon/voice/auth", authenticated: true);
            return response.data;
        }

        public async Task<T> ExecuteCloudFunction<T>(string functionName, Dictionary<string, object> args = null)
        {
            // The backend currently rejects player-callable functions until a trusted server runner is configured.
            var response = await Post<T>($"/functions/{functionName}", args ?? new Dictionary<string, object>(), authenticated: true);
            return response.data;
        }

        public async Task TrackEvent(string eventType, Dictionary<string, object> properties = null)
        {
            await Post<object>("/analytics/event", new { eventType, properties }, authenticated: true);
        }

        #region HTTP Helpers

        private async Task<RayvoResponse<T>> Get<T>(string path, bool authenticated = false)
        {
            return await GetWithRetry<T>(path, authenticated);
        }

        private async Task<RayvoResponse<T>> GetWithRetry<T>(string path, bool authenticated = false)
        {
            RayvoException lastException = null;
            for (int attempt = 0; attempt <= _maxRetries; attempt++)
            {
                try
                {
                    return await GetInternal<T>(path, authenticated);
                }
                catch (RayvoException ex)
                {
                    lastException = ex;
                    // Don't retry on client errors (4xx)
                    if (ex.Code == "VALIDATION_ERROR" || ex.Code == "UNAUTHORIZED" || ex.Code == "FORBIDDEN" || ex.Code == "NOT_FOUND")
                        throw;
                    
                    // Retry on server errors (5xx) and network issues
                    if (attempt < _maxRetries)
                        await Task.Delay(1000 * (attempt + 1)); // Exponential backoff
                }
            }
            throw lastException ?? new RayvoNetworkException("Request failed after retries");
        }

        private async Task<RayvoResponse<T>> GetInternal<T>(string path, bool authenticated = false)
        {
            using var request = UnityWebRequest.Get(_baseUrl + "/api/v1" + path);
            request.timeout = _requestTimeoutSeconds;
            SetHeaders(request, authenticated);
            await SendRequest(request);
            return ParseResponse<T>(request);
        }

        private async Task<RayvoResponse<T>> Post<T>(string path, object body, bool authenticated = false)
        {
            return await PostWithRetry<T>(path, body, authenticated);
        }

        private async Task<RayvoResponse<T>> PostWithRetry<T>(string path, object body, bool authenticated = false)
        {
            RayvoException lastException = null;
            for (int attempt = 0; attempt <= _maxRetries; attempt++)
            {
                try
                {
                    return await PostInternal<T>(path, body, authenticated);
                }
                catch (RayvoException ex)
                {
                    lastException = ex;
                    // Don't retry on client errors (4xx)
                    if (ex.Code == "VALIDATION_ERROR" || ex.Code == "UNAUTHORIZED" || ex.Code == "FORBIDDEN" || ex.Code == "NOT_FOUND")
                        throw;
                    
                    // Retry on server errors (5xx) and network issues
                    if (attempt < _maxRetries)
                        await Task.Delay(1000 * (attempt + 1)); // Exponential backoff
                }
            }
            throw lastException ?? new RayvoNetworkException("Request failed after retries");
        }

        private async Task<RayvoResponse<T>> PostInternal<T>(string path, object body, bool authenticated = false)
        {
            var json = JsonUtilityHelper.ToJson(body);
            using var request = new UnityWebRequest(_baseUrl + "/api/v1" + path, "POST");
            request.timeout = _requestTimeoutSeconds;
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            SetHeaders(request, authenticated);
            await SendRequest(request);
            return ParseResponse<T>(request);
        }

        private async Task<RayvoResponse<T>> Put<T>(string path, object body, bool authenticated = false)
        {
            var json = JsonUtilityHelper.ToJson(body);
            using var request = new UnityWebRequest(_baseUrl + "/api/v1" + path, "PUT");
            request.timeout = _requestTimeoutSeconds;
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            SetHeaders(request, authenticated);
            await SendRequest(request);
            return ParseResponse<T>(request);
        }

        private async Task Delete(string path, bool authenticated = false)
        {
            using var request = UnityWebRequest.Delete(_baseUrl + "/api/v1" + path);
            request.timeout = _requestTimeoutSeconds;
            SetHeaders(request, authenticated);
            await SendRequest(request);
        }

        private void SetHeaders(UnityWebRequest request, bool authenticated)
        {
            if (authenticated && !string.IsNullOrEmpty(_accessToken))
                request.SetRequestHeader("Authorization", "Bearer " + _accessToken);
        }

        private static async Task SendRequest(UnityWebRequest request)
        {
            var operation = request.SendWebRequest();
            while (!operation.isDone)
                await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                var errorResponse = JsonUtilityHelper.FromJson<RayvoErrorResponse>(request.downloadHandler?.text);
                var message = errorResponse?.error?.message;
                var code = errorResponse?.error?.code;
                
                if (string.IsNullOrEmpty(message)) message = request.error;
                if (request.responseCode > 0) message += " (HTTP " + request.responseCode + ")";
                
                if (string.IsNullOrEmpty(code))
                {
                    // Infer error code from HTTP status
                    if (request.responseCode == 401) code = "UNAUTHORIZED";
                    else if (request.responseCode == 403) code = "FORBIDDEN";
                    else if (request.responseCode == 404) code = "NOT_FOUND";
                    else if (request.responseCode == 429) code = "RATE_LIMIT_EXCEEDED";
                    else if (request.responseCode >= 500) code = "INTERNAL_ERROR";
                    else code = "UNKNOWN_ERROR";
                }
                
                throw new RayvoException(message, code);
            }
        }

        private static RayvoResponse<T> ParseResponse<T>(UnityWebRequest request)
        {
            var text = request.downloadHandler.text;
            if (request.result == UnityWebRequest.Result.ProtocolError)
            {
                var errorResponse = JsonUtilityHelper.FromJson<RayvoErrorResponse>(text);
                return new RayvoResponse<T>
                {
                    success = false,
                    error = errorResponse?.error
                };
            }
            return JsonUtilityHelper.FromJson<RayvoResponse<T>>(text);
        }

        #endregion
    }
}
