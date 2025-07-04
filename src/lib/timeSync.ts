let timeOffset = 0;
let isSynced = false;

async function syncTime() {
    try {
        const response = await fetch('https://use.ntpjs.org/v1/time.json');
        if (!response.ok) {
            throw new Error(`NTP request failed with status ${response.status}`);
        }
        const data = await response.json();
        const serverTime = data.now * 1000; // Convert to milliseconds
        const localTime = new Date().getTime();
        timeOffset = serverTime - localTime;
        isSynced = true;
        console.log(`Time synced. Offset: ${timeOffset}ms`);
    } catch (error) {
        console.error('Failed to sync time with NTP server:', error);
        isSynced = false;
    }
}

// Sync time periodically
setInterval(syncTime, 600000); // Sync every 10 minutes

// Initial sync
syncTime();

export function getSyncedTime() {
    if (!isSynced) {
        // Fallback to local time if not synced
        return new Date().getTime();
    }
    return new Date().getTime() + timeOffset;
}
