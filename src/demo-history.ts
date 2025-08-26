/**
 * Demo script to showcase historical data functionality
 * Run with: npm run demo:history
 */

console.log('🚀 PLC Simulator - Historical Data Demo');
console.log('=====================================\n');

console.log(' Historical data storage is now active!');
console.log(' The simulator is automatically saving all sensor readings to SQLite database.\n');

console.log('💡 Try these API endpoints:');
console.log('');
console.log('1. Get historical statistics:');
console.log('   curl "http://localhost:8080/history/stats"');
console.log('');
console.log('2. Query latest 10 readings:');
console.log('   curl "http://localhost:8080/history/query?limit=10"');
console.log('');
console.log('3. Query specific sensor data:');
console.log('   curl "http://localhost:8080/history/query?name=Module1_Sensor1&limit=5"');
console.log('');
console.log('4. Query data from last 5 minutes:');
const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
console.log(`   curl "http://localhost:8080/history/query?from=${fiveMinutesAgo}&limit=50"`);
console.log('');
console.log('5. Export data as CSV:');
console.log('   curl "http://localhost:8080/history/export.csv?limit=100" -o sensor_data.csv');
console.log('');
console.log('6. Export data as JSON:');
console.log('   curl "http://localhost:8080/history/export.json?limit=100" -o sensor_data.json');
console.log('');
console.log('7. Cleanup old data (older than 7 days):');
console.log('   curl -X POST -H "Content-Type: application/json" -d "{\\"days\\": 7}" "http://localhost:8080/history/cleanup"');
console.log('');

console.log(' Historical Data Features:');
console.log('-  Real-time data persistence to SQLite database');
console.log('-  Flexible query API with filtering by sensor name, time range, module ID');
console.log('-  CSV and JSON export functionality');
console.log('-  Data cleanup and statistics');
console.log('-  Database indexes for optimal query performance');
console.log('-  Thread-safe batch data insertion');
console.log('');

console.log(' Database location: data/history.db');
console.log(' Data is automatically indexed by sensor name, timestamp, and module ID');
console.log('');

console.log(' The PLC simulator is now running with full historical data capabilities!');

export {};