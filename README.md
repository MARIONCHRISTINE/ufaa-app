23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ py --version
Python 3.10.1

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ py -m venv .venv

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ .\.venv\Scripts\python.exe -m pip install -r requirements.txt
bash: ..venvScriptspython.exe: command not found

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ ^C

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ ./.venv/Scripts/python.exe -m pip install -r requirements.txt
Collecting fastapi==0.115.6
  Downloading fastapi-0.115.6-py3-none-any.whl (94 kB)
     |████████████████████████████████| 94 kB 736 kB/s
Collecting uvicorn[standard]==0.34.0
  Downloading uvicorn-0.34.0-py3-none-any.whl (62 kB)
     |████████████████████████████████| 62 kB 382 kB/s
Collecting motor==3.6.0
  Downloading motor-3.6.0-py3-none-any.whl (74 kB)
     |████████████████████████████████| 74 kB 1.3 MB/s
Collecting pymongo==4.9.2
  Downloading pymongo-4.9.2-cp310-cp310-win_amd64.whl (825 kB)
     |████████████████████████████████| 825 kB 6.4 MB/s
Collecting pydantic-settings==2.7.1
  Downloading pydantic_settings-2.7.1-py3-none-any.whl (29 kB)
Collecting bcrypt==4.2.1
  Downloading bcrypt-4.2.1-cp39-abi3-win_amd64.whl (153 kB)
     |████████████████████████████████| 153 kB ...
Collecting python-multipart==0.0.20
  Downloading python_multipart-0.0.20-py3-none-any.whl (24 kB)
Collecting openpyxl==3.1.5
  Using cached openpyxl-3.1.5-py2.py3-none-any.whl (250 kB)
Collecting reportlab==4.2.5
  Downloading reportlab-4.2.5-py3-none-any.whl (1.9 MB)
     |████████████████████████████████| 1.9 MB 3.3 MB/s
Collecting tzdata==2024.2
  Downloading tzdata-2024.2-py2.py3-none-any.whl (346 kB)
     |████████████████████████████████| 346 kB 6.4 MB/s
Collecting PyMySQL==1.1.1
  Downloading PyMySQL-1.1.1-py3-none-any.whl (44 kB)
     |████████████████████████████████| 44 kB 1.3 MB/s
Collecting pydantic!=1.8,!=1.8.1,!=2.0.0,!=2.0.1,!=2.1.0,<3.0.0,>=1.7.4
  Downloading pydantic-2.14.3-py3-none-any.whl (494 kB)
     |████████████████████████████████| 494 kB 3.3 MB/s
Collecting starlette<0.42.0,>=0.40.0
  Downloading starlette-0.41.3-py3-none-any.whl (73 kB)
     |████████████████████████████████| 73 kB 623 kB/s
Collecting typing-extensions>=4.8.0
  Using cached typing_extensions-4.16.0-py3-none-any.whl (45 kB)
Collecting click>=7.0
  Downloading click-8.5.1-py3-none-any.whl (126 kB)
     |████████████████████████████████| 126 kB 6.8 MB/s
Collecting h11>=0.8
  Downloading h11-0.16.0-py3-none-any.whl (37 kB)
Collecting colorama>=0.4
  Downloading colorama-0.4.6-py2.py3-none-any.whl (25 kB)
Collecting python-dotenv>=0.13
  Downloading python_dotenv-1.2.4-py3-none-any.whl (23 kB)
Collecting pyyaml>=5.1
  Downloading pyyaml-6.0.3-cp310-cp310-win_amd64.whl (158 kB)
     |████████████████████████████████| 158 kB 6.8 MB/s
Collecting watchfiles>=0.13
  Downloading watchfiles-1.3.0-cp310-abi3-win_amd64.whl (290 kB)
     |████████████████████████████████| 290 kB 6.4 MB/s
Collecting httptools>=0.6.3
  Downloading httptools-0.9.0-cp310-cp310-win_amd64.whl (92 kB)
     |████████████████████████████████| 92 kB 256 kB/s
Collecting websockets>=10.4
  Downloading websockets-16.1.1-cp310-cp310-win_amd64.whl (180 kB)
     |████████████████████████████████| 180 kB 6.4 MB/s
Collecting dnspython<3.0.0,>=1.16.0
  Downloading dnspython-2.8.0-py3-none-any.whl (331 kB)
     |████████████████████████████████| 331 kB 6.4 MB/s
Collecting et-xmlfile
  Using cached et_xmlfile-2.0.0-py3-none-any.whl (18 kB)
Collecting pillow>=9.0.0
  Downloading pillow-12.3.0-cp310-cp310-win_amd64.whl (7.2 MB)
     |████████████████████████████████| 7.2 MB 504 kB/s
Collecting chardet
  Downloading chardet-7.7.0-cp310-cp310-win_amd64.whl (1.3 MB)
     |████████████████████████████████| 1.3 MB 939 kB/s
Collecting typing-inspection>=0.4.4
  Downloading typing_inspection-0.4.5-py3-none-any.whl (14 kB)
Collecting pydantic-core==2.50.4
  Downloading pydantic_core-2.50.4-cp310-cp310-win_amd64.whl (2.3 MB)
     |████████████████████████████████| 2.3 MB 364 kB/s
Collecting annotated-types>=0.6.0
  Downloading annotated_types-0.8.0-py3-none-any.whl (13 kB)
Collecting anyio<5,>=3.4.0
  Downloading anyio-4.16.0-py3-none-any.whl (134 kB)
     |████████████████████████████████| 134 kB 467 kB/s
Collecting exceptiongroup>=1.0.2
  Downloading exceptiongroup-1.3.1-py3-none-any.whl (16 kB)
Collecting idna>=2.8
  Downloading idna-3.20-py3-none-any.whl (69 kB)
     |████████████████████████████████| 69 kB 246 kB/s
Installing collected packages: typing-extensions, idna, exceptiongroup, typing-inspection, pydantic-core, h11, dnspython, click, anyio, annotated-types, websockets, watchfiles, uvicorn, starlette, pyyaml, python-dotenv, pymongo, pydantic, pillow, httptools, et-xmlfile, colorama, chardet, tzdata, reportlab, python-multipart, PyMySQL, pydantic-settings, openpyxl, motor, fastapi, bcrypt
Successfully installed PyMySQL-1.1.1 annotated-types-0.8.0 anyio-4.16.0 bcrypt-4.2.1 chardet-7.7.0 click-8.5.1 colorama-0.4.6 dnspython-2.8.0 et-xmlfile-2.0.0 exceptiongroup-1.3.1 fastapi-0.115.6 h11-0.16.0 httptools-0.9.0 idna-3.20 motor-3.6.0 openpyxl-3.1.5 pillow-12.3.0 pydantic-2.14.3 pydantic-core-2.50.4 pydantic-settings-2.7.1 pymongo-4.9.2 python-dotenv-1.2.4 python-multipart-0.0.20 pyyaml-6.0.3 reportlab-4.2.5 starlette-0.41.3 typing-extensions-4.16.0 typing-inspection-0.4.5 tzdata-2024.2 uvicorn-0.34.0 watchfiles-1.3.0 websockets-16.1.1
WARNING: You are using pip version 21.2.4; however, version 26.3 is available.
You should consider upgrading via the 'C:\Users\23203159\OneDrive - Airtel Africa\Compliance\GRC\ufaa-app\backend\.venv\Scripts\python.exe -m pip install --upgrade pip' command.

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ copy .env.example .env
bash: copy: command not found

23203159@KE-23203159-WL1 MINGW64 ~/OneDrive - Airtel Africa/Compliance/GRC/ufaa-app/backend (main)
$ copy .env.example .env
bash: copy: command not found
