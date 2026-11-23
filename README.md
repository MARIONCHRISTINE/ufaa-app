# Copy this file to .env and adjust if needed.
MONGO_URL=mongodb://23203159_db_user:hidden@ac-iyccbsm-shard-00-00.bpzm0ts.mongodb.net:27017,ac-iyccbsm-shard-00-01.bpzm0ts.mongodb.net:27017,ac-iyccbsm-shard-00-02.bpzm0ts.mongodb.net:27017/?tls=true&authSource=admin&replicaSet=admin&replicaSet=atlas-10dau7-shard-0&retryWrites=true&w=majority&appName=Cluster0 MONGO_DB=ufaa_db

# Comma-separated list of origins allowed to call the API (the React dev server).
CORS_ORIGINS=http://localhost:5173

# Where uploaded stamped letters, generated submission files and temp files are stored.
STORAGE_DIR=storage

TIMEZONE=Africa/Nairobi

# Password for the seeded "admin" account, used only when the users collection is empty.
DEFAULT_ADMIN_PASSWORD=hidden
