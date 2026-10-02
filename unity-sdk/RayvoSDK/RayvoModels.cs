using System;
using System.Collections.Generic;

namespace Rayvo.SDK
{
    [Serializable]
    public class RayvoPlayer
    {
        public string publicId;
        public string displayName;
        public bool isGuest;
        public string customId;
    }

    [Serializable]
    public class RayvoAuthResult
    {
        public RayvoPlayer player;
        public string accessToken;
        public string refreshToken;
        public string expiresIn;
    }

    [Serializable]
    public class RayvoRefreshResult
    {
        public string accessToken;
        public string refreshToken;
    }

    [Serializable]
    public class RayvoPlayerProfile
    {
        public string public_id;
        public string display_name;
        public string avatar_url;
        public string bio;
        public bool is_guest;
        public string created_at;
    }

    [Serializable]
    public class RayvoPlayerData
    {
        public string key;
        public string value;
        public string visibility;
        public int version;
    }

    [Serializable]
    public class RayvoDataEntry
    {
        public object value;
        public string visibility;
    }

    [Serializable]
    public class RayvoDataUpdateResult
    {
        public string[] updated;
        public Dictionary<string, string> errors;
    }

    [Serializable]
    public class RayvoInventoryItem
    {
        public string instanceId;
        public string itemId;
        public int quantity;
        public string acquiredAt;
    }

    [Serializable]
    public class RayvoCurrencyBalance
    {
        public string currencyCode;
        public float balance;
    }

    [Serializable]
    public class RayvoStatistic
    {
        public string statKey;
        public float value;
    }

    [Serializable]
    public class RayvoStatUpdate
    {
        public string statKey;
        public float? value;
        public float? increment;
    }

    [Serializable]
    public class RayvoLeaderboardResult
    {
        public RayvoLeaderboardEntry[] entries;
        public int total;
    }

    [Serializable]
    public class RayvoLeaderboardEntry
    {
        public int rank;
        public string publicId;
        public string displayName;
        public float score;
    }

    [Serializable]
    public class RayvoAchievement
    {
        public string achievementId;
        public string displayName;
        public string description;
        public float progress;
        public float targetValue;
        public bool unlocked;
        public string unlockedAt;
        public bool isHidden;
    }

    [Serializable]
    public class RayvoFriend
    {
        public string publicId;
        public string displayName;
        public string status;
        public string lastSeenAt;
    }

    [Serializable]
    public class RayvoMatchmakingTicket
    {
        public string ticketId;
        public string status;
        public string queueName;
    }

    [Serializable]
    public class RayvoMatchmakingTicketStatus
    {
        public string ticket_id;
        public string status;
        public string matched_match_id;
        public string photon_room_name;
    }

    [Serializable]
    public class RayvoMatchmakingOptions
    {
        public float? SkillRating;
        public string Region;
    }

    [Serializable]
    public class RayvoPhotonAuthData
    {
        public string appId;
        public string userId;
        public string authToken;
        public string region;
        public string appVersion;
        public string serviceType;
    }

    [Serializable]
    public class RayvoResponse<T>
    {
        public bool success;
        public T data;
        public RayvoError error;
    }

    [Serializable]
    public class RayvoErrorResponse
    {
        public bool success;
        public RayvoError error;
    }

    [Serializable]
    public class RayvoError
    {
        public string code;
        public string message;
    }

    public class RayvoException : Exception
    {
        public string Code { get; }

        public RayvoException(string message) : base(message) 
        {
            Code = "UNKNOWN_ERROR";
        }

        public RayvoException(string message, string code) : base(message) 
        {
            Code = code;
        }
    }

    public class RayvoValidationException : RayvoException
    {
        public RayvoValidationException(string message) : base(message, "VALIDATION_ERROR") { }
    }

    public class RayvoNetworkException : RayvoException
    {
        public RayvoNetworkException(string message) : base(message, "NETWORK_ERROR") { }
    }

    public class RayvoAuthException : RayvoException
    {
        public RayvoAuthException(string message) : base(message, "UNAUTHORIZED") { }
    }
}
