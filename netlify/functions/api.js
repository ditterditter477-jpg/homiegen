const { MongoClient } = require('mongodb');

// DEIN Connection String - HIER EINFÜGEN!
const uri = 'mongodb+srv://nicegaming772_db_user:ypdmpl5OvCpgHm26@cluster0.sqi9yyj.mongodb.net/?appName=Cluster0';
const client = new MongoClient(uri);
const dbName = 'homiegen';

let db = null;

async function getDb() {
  if (!db) {
    await client.connect();
    db = client.db(dbName);
    
    // Collections erstellen falls nicht vorhanden
    const collections = await db.listCollections().toArray();
    const names = collections.map(c => c.name);
    
    // Users Collection mit Admin-Usern
    if (!names.includes('users')) {
      await db.createCollection('users');
      
      // Hash für "K7mQ92xL4vT8pR6zN3"
      const adminHash = '3f7c2b8f9a4d1e6c0b5a8f3d9e2c1b4a5f6d7e8c9a0b1c2d3e4f5a6b7c8d9e0f';
      
      await db.collection('users').insertMany([
        {
          id: 1,
          username: 'nova',
          password: adminHash,
          role: 'admin',
          ip: '',
          cooldowns: {},
          created: '2026-09-01',
          blacklisted: false,
          _plainPassword: 'K7mQ92xL4vT8pR6zN3',
          license_key: null,
          license_type: null,
          daily_limit: 0,
          used_today: 0,
          email: 'nova@homiegen.com'
        },
        {
          id: 2,
          username: 'gurke',
          password: adminHash,
          role: 'admin',
          ip: '',
          cooldowns: {},
          created: '2026-09-01',
          blacklisted: false,
          _plainPassword: 'K7mQ92xL4vT8pR6zN3',
          license_key: null,
          license_type: null,
          daily_limit: 0,
          used_today: 0,
          email: 'gurke@homiegen.com'
        }
      ]);
    }
    
    if (!names.includes('services')) await db.createCollection('services');
    if (!names.includes('accounts')) await db.createCollection('accounts');
    if (!names.includes('deliveries')) await db.createCollection('deliveries');
    if (!names.includes('changelog')) await db.createCollection('changelog');
    if (!names.includes('logs')) await db.createCollection('logs');
    if (!names.includes('licenses')) await db.createCollection('licenses');
  }
  return db;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const db = await getDb();
    const body = JSON.parse(event.body || '{}');
    const { action, data } = body;

    switch (action) {
      case 'load': {
        const [users, services, accounts, deliveries, changelog, logs, licenses] = await Promise.all([
          db.collection('users').find({}).toArray(),
          db.collection('services').find({}).toArray(),
          db.collection('accounts').find({}).toArray(),
          db.collection('deliveries').find({}).toArray(),
          db.collection('changelog').find({}).sort({ id: -1 }).toArray(),
          db.collection('logs').find({}).sort({ id: -1 }).limit(50).toArray(),
          db.collection('licenses').find({}).toArray()
        ]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            users: users || [],
            services: services || [],
            accounts: accounts || [],
            deliveries: deliveries || [],
            changelog: changelog || [],
            logs: logs || [],
            licenses: licenses || []
          })
        };
      }

      case 'save': {
        const collections = ['users', 'services', 'accounts', 'deliveries', 'changelog', 'logs', 'licenses'];
        
        for (const collectionName of collections) {
          if (data[collectionName]) {
            const collection = db.collection(collectionName);
            await collection.deleteMany({});
            if (data[collectionName].length > 0) {
              await collection.insertMany(data[collectionName]);
            }
          }
        }
        
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
    }
  } catch (error) {
    console.error('API Error:', error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};