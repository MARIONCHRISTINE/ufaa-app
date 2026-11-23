23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
INFO:     Started server process [29912]
INFO:     Waiting for application startup.
ERROR:    Traceback (most recent call last):
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\starlette\routing.py", line 693, in lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\fastapi\routing.py", line 133, in merged_lifespan
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\contextlib.py", line 199, in __aenter__
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\app\main.py", line 21, in lifespan
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\app\db.py", line 42, in connect
  File "C:\Users\23203159\AppData\Local\Programs\Python\Python310\lib\concurrent\futures\thread.py", line 58, in run
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\_csot.py", line 120, in csot_wrapper
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\database.py", line 906, in command
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\mongo_client.py", line 1701, in _conn_for_reads
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\mongo_client.py", line 1649, in _select_server
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\topology.py", line 398, in select_server
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\topology.py", line 376, in _select_server
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\topology.py", line 283, in select_servers
  File "C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\lib\site-packages\pymongo\synchronous\topology.py", line 333, in _select_servers_loop
pymongo.errors.ServerSelectionTimeoutError: SSL handshake failed: ac-iyccbsm-shard-00-00.bpzm0ts.mongodb.net:27017: EOF occurred in violation of protocol (_ssl.c:997) (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms),SSL handshake failed: ac-iyccbsm-shard-00-01.bpzm0ts.mongodb.net:27017: EOF occurred in violation of protocol (_ssl.c:997) (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms),SSL handshake failed: ac-iyccbsm-shard-00-02.bpzm0ts.mongodb.net:27017: EOF occurred in violation of protocol (_ssl.c:997) (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms), Timeout: 30s, Topology Description: <TopologyDescription id: 6b04311d7579da3d633c1339, topology_type: ReplicaSetNoPrimary, servers: [<ServerDescription ('ac-iyccbsm-shard-00-00.bpzm0ts.mongodb.net', 27017) server_type: Unknown, rtt: None, error=AutoReconnect('SSL handshake failed: ac-iyccbsm-shard-00-00.bpzm0ts.mongodb.net:27017: EOF occurred in violation of protocol (_ssl.c:997) (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms)')>, <ServerDescription ('ac-iyccbsm-shard-00-01.bpzm0ts.mongodb.net', 27017) server_type: Unknown, rtt: None, error=AutoReconnect('SSL handshake failed: ac-iyccbsm-shard-00-01.bpzm0ts.mongodb.net:27017: EOF occurred in violation of protocol (_ssl.c:997) (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms)')>, <ServerDescription ('ac-iyccbsm-shard-00-02.bpzm0ts.mongodb.net', 27017) server_type: Unknown, rtt: None, error=AutoReconnect('SSL handshake failed: ac-iyccbsm-shard-00-02.bpzm0ts.mongodb.net:27017: EOF occurred in violation of protocol (_ssl.c:997) (configured timeouts: socketTimeoutMS: 20000.0ms, connectTimeoutMS: 20000.0ms)')>]>

ERROR:    Application startup failed. Exiting.

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
my 16 letter password@cluster0.bpzm0ts.mongodb.net/
