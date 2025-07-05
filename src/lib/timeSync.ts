let timeOffset = 0;
let isSynced = false;
let syncing = false;
let syncPromise: Promise<void> | null = null;

async function syncTime() {
    if (syncing) return syncPromise;
    syncing = true;

    syncPromise = (async () => {
        try {
            const requestSentTime = new Date().getTime();
            const response = await fetch('https://use.ntpjs.org/v1/time.json');
            const responseReceivedTime = new Date().getTime();

            if (!response.ok) {
                throw new Error(`NTP request failed with status ${response.status}`);
            }

            const data = await response.json();
            const serverTime = data.now * 1000; // Convert to milliseconds
            const networkLatency = (responseReceivedTime - requestSentTime) / 2;
            const estimatedServerTimeAtReceipt = serverTime + networkLatency;

            timeOffset = estimatedServerTimeAtReceipt - responseReceivedTime;
            isSynced = true;
        } catch (error) {
            console.error('Failed to sync time with NTP server:', error);
            isSynced = false;
            // Re-throw the error to be caught by callers of ensureTimeSynced
            throw error;
        } finally {
            syncing = false;
            syncPromise = null;
        }
    })();

    return syncPromise;
}

// Sync time periodically
setInterval(syncTime, 600000); // Sync every 10 minutes

// Initial sync is now handled by ensureTimeSynced on demand
// syncTime();

export function getSyncedTime() {
    if (!isSynced) {
        // Fallback to local time if not synced
        return new Date().getTime();
    }
    return new Date().getTime() + timeOffset;
}

export function isTimeSynced() {
    return isSynced;
}

export async function ensureTimeSynced() {
    if (!isSynced) {
        await syncTime();
    }
}
