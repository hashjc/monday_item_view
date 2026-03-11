import mondaySdk from "monday-sdk-js";

import { DEFAULT_COUNTRY } from "../metadataConfig";
const monday = mondaySdk();

/**
 * Fetch the monday account's country code (ISO 3166 two-letter code).
 * e.g. "US", "IN", "GB", "DE"
 *
 * @returns {Promise<string>} country code, or "US" as fallback
 */
export async function getAccountCountryCode() {
    try {
        const query = `query { account { country_code } }`;
        const response = await monday.api(query);
        if (response.errors) {
            console.warn("[getAccountCountryCode] GraphQL errors:", response.errors);
            return DEFAULT_COUNTRY;
        }

        const code = response?.data?.account?.country_code;
        return code || DEFAULT_COUNTRY;
    } catch (error) {
        console.error("[getAccountCountryCode] Error:", error);
        return DEFAULT_COUNTRY;
    }
}