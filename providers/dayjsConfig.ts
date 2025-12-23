// src/utils/dayjsConfig.ts (or .js)
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
// Import other plugins as needed, e.g., 'dayjs/plugin/duration'
import 'dayjs/locale/es'; // Example: import Spanish locale

// Extend Day.js with the necessary plugins
dayjs.extend(utc);
dayjs.extend(timezone);
// dayjs.extend(duration); // Uncomment if duration plugin is needed

// Set global configurations
dayjs.locale('es'); // Set default locale globally
dayjs.tz.setDefault('America/New_York'); // Set default timezone globally

// Export the configured dayjs instance
export default dayjs;
