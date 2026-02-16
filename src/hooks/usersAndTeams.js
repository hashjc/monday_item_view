// usersAndTeams.js file
// Query records of a Monday board
import mondaySdk from "monday-sdk-js";
import { useState, useEffect } from "react";

const monday = mondaySdk();
const LIMIT = 500;

/**
 * Get All Monday Users
 * @returns {Promise<Object>} { success, error, users }
 */
export async function getAllUsers() {
    try {
        const query = `
            query {
                users (limit: ${LIMIT}) {
                    id
                    name
                    email
                    is_admin
                    is_guest
                    photo_thumb
                }
            }
        `;

        const response = await monday.api(query);

        if (response.errors) {
            // Handle permission or GraphQL errors
            const isPermissionError = response.errors.some(err =>
                err.message.toLowerCase().includes("permission") ||
                err.message.toLowerCase().includes("access")
            );

            return {
                success: false,
                error: isPermissionError
                    ? "Permission denied: App lacks scope to read users."
                    : response.errors[0].message,
                users: []
            };
        }

        return {
            success: true,
            error: null,
            users: response.data.users || []
        };

    } catch (error) {
        console.error("Error fetching users:", error);
        return {
            success: false,
            error: error.message || "Failed to fetch users",
            users: []
        };
    }
}

/**
 * Search Monday Users
 * @returns {Promise<Object>} { success, error, users }
 */
export async function searchUsersByNameOrEmail(searchText) {
    if (!searchText) {
        return { success: false, error: "Search text is required", users: [] };
    }

    try {
        const query = `
            query {
                users(limit: 100) {
                    id
                    name
                    email
                }
            }
        `;

        const response = await monday.api(query);

        if (response.errors) {
            return {
                success: false,
                error: response.errors[0].message,
                users: []
            };
        }

        const allUsers = response.data?.users || [];

        const lowerSearch = searchText.toLowerCase();

        const filteredUsers = allUsers.filter(user =>
            user.name?.toLowerCase().includes(lowerSearch) ||
            user.email?.toLowerCase().includes(lowerSearch)
        );

        return {
            success: true,
            error: "",
            users: filteredUsers
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            users: []
        };
    }
}

/**
 * Get All Monday Teams
 * @returns {Promise<Object>} { success, error, teams }
 */
export async function getAllTeams() {
    try {
        const query = `
            query {
                teams {
                    id
                    name
                    users {
                        id
                        name
                    }
                }
            }
        `;

        const response = await monday.api(query);

        if (response.errors) {
            return {
                success: false,
                error: "Failed to fetch teams. Check if 'teams:read' scope is enabled.",
                teams: []
            };
        }

        return {
            success: true,
            error: null,
            teams: response.data.teams || []
        };

    } catch (error) {
        console.error("Error fetching teams:", error);
        return {
            success: false,
            error: error.message || "Failed to fetch teams",
            teams: []
        };
    }
}

/**
 * Hook to fetch both Users and Teams simultaneously
 */
export function useUsersAndTeams() {
    const [data, setData] = useState({
        users: [],
        teams: [],
        loading: true,
        error: null
    });

    useEffect(() => {
        const fetchData = async () => {
            const [usersRes, teamsRes] = await Promise.all([
                getAllUsers(),
                getAllTeams()
            ]);

            if (!usersRes.success || !teamsRes.success) {
                setData(prev => ({
                    ...prev,
                    loading: false,
                    error: usersRes.error || teamsRes.error
                }));
                return;
            }

            setData({
                users: usersRes.users,
                teams: usersRes.teams,
                loading: false,
                error: null
            });
        };

        fetchData();
    }, []);

    return data;
}