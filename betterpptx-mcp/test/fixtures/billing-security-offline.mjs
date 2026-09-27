import net from 'node:net'
import dgram from 'node:dgram'
import { syncBuiltinESMExports } from 'node:module'

// Existing compatibility scripts run in a fresh temporary cwd, with an empty
// credential environment and transport access denied before their imports.
const deny = () => { throw new Error('Network access is forbidden in this offline billing fixture') }
globalThis.fetch = deny
net.Socket.prototype.connect = deny
dgram.Socket.prototype.send = deny
dgram.Socket.prototype.connect = deny
syncBuiltinESMExports()
