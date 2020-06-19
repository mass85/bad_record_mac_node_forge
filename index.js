#!/usr/bin/env node
const yargs = require('yargs');
const fs = require('fs');
const net = require('net');
const createTlsPeer = require('./tlsPeer');

function hexdump(buffer, blockSize) {
  blockSize = blockSize || 16;
  var lines = [];
  var hex = "0123456789ABCDEF";
  for (var b = 0; b < buffer.length; b += blockSize) {
    var block = buffer.slice(b, Math.min(b + blockSize, buffer.length));
    var addr = ("0000" + b.toString(16)).slice(-4);
    var codes = block.split('').map(function (ch) {
      var code = ch.charCodeAt(0);
      return " " + hex[(0xF0 & code) >> 4] + hex[0x0F & code];
    }).join("");


    codes += " ".repeat(blockSize - block.length);
    var chars = block.replace(/[\x00-\x1F\x20]/g, '.');
    chars += " ".repeat(blockSize - block.length);
    lines.push(addr + " " + codes + " " + chars);
  }

  return lines.join("\n");
}

const caCert = fs.readFileSync('./rootCA.crt').toString();

function createClient(argv) {
  const clientCert = fs.readFileSync('./client.crt').toString();
  const clientKey = fs.readFileSync('./client.key').toString();
  const tls = createTlsPeer({cert: clientCert, key: clientKey, caCert});
  const socket = net.createConnection({ port: argv.port }, () => {
    // 'connect' listener
    console.log('connected to TCP server!');
    tls.handshake();
  });
  socket.on('data', (data) => {
    //console.log(data.toString());
    console.log('socket received, length: ', data.length);
    tls.processTls(data);
  });
  socket.on('end', () => {
    console.log('disconnected from TCP server');
    tls.reset();
  });
  tls.on('sendTls', data => {
    console.log('socket sends, length: ', data.length)
    console.log(hexdump(data, 8));
    socket.write(data);
  });
  const outStream = argv.fileOut ? fs.createWriteStream(argv.fileOut) : null;
  const msg = {
    header: {version: 1, type: 'measurements'},
    data: {voltages: [240, 239, 239], currents: [1, 0 ,2], temperatures: [56, 39, 59],
      voltagesB: [240, 239, 239], currentsB: [1, 0 ,2]}
  };
  let dataToSend = JSON.stringify(msg);
  if (argv.dataSize) {
    dataToSend = Buffer.alloc(argv.dataSize, 'a');
  }
  tls.on('connected', () => {
    if (argv.fileIn) {//util.encodeUtf8(str)
      //tls.send(fs.readFileSync(argv.fileIn));
      tls.send(fs.readFileSync(argv.fileIn).toString('base64'));
    } else {
      //tls.send('client introduction');
      tls.send(dataToSend);
      // tls.send(dataToSend);
      // tls.send(dataToSend);
    }
  });
  let cntr = 0;
  let accum = "";
  tls.on('receive', data => {
    if (outStream) {
      console.log('writing file stream, length: ', data.length);
      outStream.write(data);
      return;
    }
    //console.log('client received: ', data);
    if (argv.dataSize) {
      accum += data;
      if (accum === dataToSend.toString()) {
        accum = "";
        if (++cntr % 1 === 0) {
          console.log('cntr', cntr);
          tls.send('client good bye');
        } else {
          tls.send(dataToSend);
        }
      } else if (accum > argv.dataSize) {
        console.log('too long data in accum, length: ', accum.length);
        accum = "";
      }
    } else if (data === 'server introduction') {
      tls.send('client request');
    } else if (data === 'server response') {
      if (++cntr % 10 === 0) {
        console.log('cntr', cntr);
        tls.send('client good bye');
      }else {
        tls.send('client request');
      }
    } else if (data === 'server good bye') {
      tls.close();
    } else {
      console.log(`client does not understand message (length ${data.length}): `, data);
    }
  });
  tls.on('disconnected', () => {
    socket.end();
  });
  tls.on('error', err => {
    //console.log('TLS Connection error:', err);
  });
}

function createServer(argv) {
  const serverCert = fs.readFileSync('./server.crt').toString();
  const serverKey = fs.readFileSync('./server.key').toString();
  const server = net.createServer(socket => {
    console.log('connected to TCP client!');
    const tls = createTlsPeer({server: true, cert: serverCert, key: serverKey, caCert});
    socket.on('data', (data) => {
      console.log("received data length: ", data.length);
      tls.processTls(data);
    });
    socket.on('end', () => {
      console.log('disconnected from TCP client');
      tls.reset();
    });
    tls.on('sendTls', data => {
      socket.write(data);
    });
    tls.on('connected', () => {
      console.log('TLS handshake finished');
    });
    tls.on('receive', data => {
      console.log('Server received decrypted data, length: ', data.length);
      return;
      if (argv.echo) {
        tls.send(data);
      } else if (data === 'client introduction') {
        tls.send('server introduction');
      } else if (data === 'client request') {
        tls.send('server response');
      } else if (data === 'client good bye') {
        tls.send('server good bye');
      } else {
        console.log('server does not understand message');
      }
    });
    tls.on('disconnected', () => {
      socket.end();
    });
    tls.on('error', err => {
      //console.log('TLS Connection error:', err);
    });
  });

  server.on('error', (err) => {
    throw err;
  });
  server.listen(argv.port, () => {
    console.log('TCP server bound');
  });
}

yargs
  .command('client [port]', 'act as client', yargs => {
    yargs
      .positional('port', {describe: 'port of the recipient', default: 8124})
      .option('fileIn', {describe: 'path to file that will be read'})
      .option('fileOut', {describe: 'path to file that will be written'})
      .option('dataSize', {describe: 'size of data to send in each message'})
  }, createClient)
  .command('server [port]', 'act as server', yargs => {
    yargs
      .positional('port', {describe: 'port to bound to', default: 8124})
      .option('echo', {describe: 'echo received bytes back to client'})
  }, createServer)
  .argv;
