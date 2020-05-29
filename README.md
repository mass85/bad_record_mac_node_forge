This repo presents a bug related to node-forge TLS implementation.
 
Run:
 ```
npm i
./test
```
 
On Kubuntu 18.04.4 with node v10.16.0 I get:
```
marcin@inspiron-7566:~/bad_record_mac_node_forge$ ./test.sh 
TCP server bound
connected to TCP client!
connected to TCP server!
socket received, length:  1375
TLS Client verifying certificate w/CN: "server", verified: true...
TLS Server verifying certificate w/CN: "client", verified: true...
TLS Server connected
TLS handshake finished
socket received, length:  73
TLS Client connected
socket received, length:  23088
writing file stream, length:  15360
socket received, length:  23071
writing file stream, length:  15360
socket received, length:  55
TLS Server error: { message: 'Could not decrypt record or bad MAC.',
  send: true,
  alert: { level: 2, description: 20 },
  origin: 'server' }
TLS Server disconnected
TLS Client error: { message: 'Bad record MAC.',
  send: false,
  origin: 'server',
  alert: { level: 2, description: 20 } }
TLS Client disconnected
disconnected from TCP server
disconnected from TCP client
```
Note that numbers of bytes received are different in each run.