using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;
using UnityEngine;

namespace Rayvo.SDK
{
    /// <summary>
    /// Small JSON adapter for Unity payloads. Supports dictionaries, collections,
    /// serializable public fields, and anonymous objects with public properties.
    /// </summary>
    public static class JsonUtilityHelper
    {
        public static string ToJson(object obj)
        {
            return Serialize(obj);
        }

        public static T FromJson<T>(string json)
        {
            if (string.IsNullOrEmpty(json)) return default;
            try
            {
                return JsonUtility.FromJson<T>(json);
            }
            catch
            {
                Debug.LogWarning("[RayvoSDK] JSON parse fallback for: " + typeof(T).Name);
                return default;
            }
        }

        private static string Serialize(object value)
        {
            if (value == null) return "null";
            if (value is string text) return Quote(text);
            if (value is char character) return Quote(character.ToString());
            if (value is bool boolean) return boolean ? "true" : "false";
            if (value is byte || value is sbyte || value is short || value is ushort ||
                value is int || value is uint || value is long || value is ulong ||
                value is float || value is double || value is decimal)
                return Convert.ToString(value, CultureInfo.InvariantCulture);

            if (value is IDictionary dictionary)
            {
                var pairs = new List<string>();
                foreach (DictionaryEntry entry in dictionary)
                    pairs.Add(Quote(Convert.ToString(entry.Key, CultureInfo.InvariantCulture)) + ":" + Serialize(entry.Value));
                return "{" + string.Join(",", pairs) + "}";
            }

            if (value is IEnumerable sequence)
            {
                var items = new List<string>();
                foreach (var item in sequence) items.Add(Serialize(item));
                return "[" + string.Join(",", items) + "]";
            }

            var members = new List<string>();
            var type = value.GetType();
            foreach (var field in type.GetFields(BindingFlags.Instance | BindingFlags.Public))
                members.Add(Quote(field.Name) + ":" + Serialize(field.GetValue(value)));
            foreach (var property in type.GetProperties(BindingFlags.Instance | BindingFlags.Public))
            {
                if (!property.CanRead || property.GetIndexParameters().Length != 0 ||
                    type.GetField(property.Name, BindingFlags.Instance | BindingFlags.Public) != null)
                    continue;
                members.Add(Quote(property.Name) + ":" + Serialize(property.GetValue(value, null)));
            }
            return "{" + string.Join(",", members) + "}";
        }

        private static string Quote(string value)
        {
            var result = new StringBuilder(value.Length + 2);
            result.Append('"');
            foreach (var character in value)
            {
                switch (character)
                {
                    case '"': result.Append("\\\""); break;
                    case '\\': result.Append("\\\\"); break;
                    case '\b': result.Append("\\b"); break;
                    case '\f': result.Append("\\f"); break;
                    case '\n': result.Append("\\n"); break;
                    case '\r': result.Append("\\r"); break;
                    case '\t': result.Append("\\t"); break;
                    default:
                        if (character < 0x20) result.Append("\\u" + ((int)character).ToString("x4"));
                        else result.Append(character);
                        break;
                }
            }
            result.Append('"');
            return result.ToString();
        }
    }
}
