import path from 'path';
import os from 'os';

export class ConfigBuilder {
  constructor(baseConfig = {}) {
    this.config = { ...baseConfig };
  }

  setNodeId(nodeId) {
    this.config.node = this.config.node || {};
    this.config.node.id = nodeId;
    return this;
  }

  setNodeName(name) {
    this.config.node = this.config.node || {};
    this.config.node.name = name;
    return this;
  }

  setDataDir(dataDir) {
    this.config.node = this.config.node || {};
    this.config.node.dataDir = dataDir;
    this.config.storage = this.config.storage || {};
    this.config.storage.path = path.join(dataDir, 'data');
    return this;
  }

  setP2PPort(port) {
    this.config.p2p = this.config.p2p || {};
    this.config.p2p.port = port;
    return this;
  }

  enablePersistentPeerId(peerId) {
    this.config.p2p = this.config.p2p || {};
    this.config.p2p.persistentPeerId = true;
    this.config.p2p.savedPeerId = peerId;
    return this;
  }


  build() {
    return this.config;
  }
}