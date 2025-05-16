import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { MinimalNetworkManager } from '../network/BootstrapNetworkManager.js';
//import { APIServer } from '../api/server.js';
import { NodeStorage } from '../utils/NodeStorage.js';
import path from 'path';

/**
 * Classe specializzata per i nodi bootstrap della rete Drakon.
 * Implementa solo le funzionalità necessarie per un nodo di ingresso,
 * senza blockchain, wallet, mining, o altre funzionalità non essenziali.
 */
export class BootstrapNode extends EventEmitter {
  constructor(config) {
    super();

    if (!config) {
      throw new Error('La configurazione è richiesta');
    }

    this.config = config;
    this.logger = new Logger('BootstrapNode');
    this.storage = new NodeStorage(this.config);
    this.bannerDisplayed = config.bannerDisplayed || false;
    this.isRunning = false;


  }

  /**
   * Avvia il nodo bootstrap
   */
  async start() {
    try {
      this.logger.info('Avvio del nodo bootstrap Drakon...');
      // Informazioni di debug su storage e PeerId
      this.logger.info('---- DEBUG INFO  NODE START ----');
      const loadedInfo = await this.storage.loadNodeInfo();
      if (loadedInfo) {
        this.logger.info(`Informazioni di storage caricate: ${JSON.stringify({
          nodeId: loadedInfo.nodeId,
          peerId: loadedInfo.peerId ? (typeof loadedInfo.peerId === 'string' ? loadedInfo.peerId : loadedInfo.peerId.id) : null,
          p2pPort: loadedInfo.p2pPort,
          hasPeerIdKeys: !!(loadedInfo.peerId && loadedInfo.peerId.privKey && loadedInfo.peerId.pubKey)

        })}`);
      } else {
        this.logger.info('Nessuna informazione di storage trovata');
      }
      this.logger.info('---------------------------------------');


      const savedInfo = await this.storage.loadNodeInfo();

      if (savedInfo && savedInfo.nodeId) {
        this.logger.info(`Caricate informazioni del nodo esistenti con ID: ${savedInfo.nodeId}`);
        // Usa le informazioni salvate
        this.nodeId = savedInfo.nodeId;

        // IMPORTANTE: Imposta il flag persistentPeerId nella configurazione
        if (savedInfo.peerId) {
          this.logger.info('PeerId trovato nelle informazioni salvate, configurazione per riutilizzo');
          this.config.p2p = this.config.p2p || {};
          this.config.p2p.persistentPeerId = true;

          // Se abbiamo l'oggetto PeerId completo con chiavi, usa anche quelle
          if (typeof savedInfo.peerId === 'object' && savedInfo.peerId.privKey && savedInfo.peerId.pubKey) {
            this.logger.info('Impostazione chiavi PeerId salvate per il riutilizzo');
            this.config.p2p.savedPeerId = savedInfo.peerId;
          } else {
            this.logger.warn('PeerId trovato ma senza chiavi complete');
          }
        }

        if (savedInfo.p2pPort) {
          this.logger.info(`Usando porta P2P salvata: ${savedInfo.p2pPort}`);
          this.config.p2p.port = savedInfo.p2pPort;
        }


      } else {
        // Se non ci sono informazioni salvate, usa l'ID del nodo dalla configurazione
        this.nodeId = this.config.node.id;
        this.logger.info(`Usando nuovo ID nodo: ${this.nodeId}`);
      }

      // Usa ConfigBuilder per costruire la configurazione definitiva
      const configBuilder = new ConfigBuilder(this.config);
      const finalConfig = configBuilder
        .setNodeId(this.nodeId)
        .setDataDir(this.config.node.dataDir)
        .setP2PPort(this.config.p2p.port)
        .build();

      this.logger.info('Configurazione finale costruita:', finalConfig);


      this.networkManager = new MinimalNetworkManager(finalConfig, this.storage);


      // Avvia il network manager (P2P)
      await this.networkManager.start();


      // Ottieni il PeerId corrente dal networkManager
      const currentPeerId = this.networkManager.node.peerId;

      // Salva le informazioni del nodo, incluso il PeerId completo
      await this.storage.saveNodeInfo({
        nodeId: this.nodeId,
        p2pPort: this.config.p2p.port,
        // apiPort: this.config.api.port,
        type: 'bootstrap',
        peerId: {
          id: currentPeerId.toString(),
          privKey: currentPeerId.privateKey
            ? Buffer.from(currentPeerId.privateKey).toString('base64')
            : null,
          pubKey: currentPeerId.publicKey
            ? Buffer.from(currentPeerId.publicKey).toString('base64')
            : null
        }
      });

      // Verifica il percorso di salvataggio effettivo
      const storagePath = path.resolve(this.storage.storageDir);
      this.logger.info(`PeerId salvato per futuri riavvii in: ${storagePath}`);
      this.logger.info(`PeerId: ${currentPeerId.toString()}`);

      this.isRunning = true;
      this.logger.info('Nodo bootstrap avviato con successo');



      return true;
    } catch (error) {
      this.logger.error("Errore durante l'avvio del nodo bootstrap:", error);
      throw error;
    }
  }

  /**
   * Arresta il nodo bootstrap
   */
  async stop() {
    try {
      this.logger.info('Arresto del nodo bootstrap...');

      // Arresta l'API server
      // if (this.apiServer) {
      //   await this.apiServer.stop();
      // }

      // Arresta il network manager
      if (this.networkManager) {
        await this.networkManager.stop();
      }

      this.isRunning = false;
      this.logger.info('Nodo bootstrap arrestato con successo!');

      // Emetti l'evento 'stopped'
      this.emit('stopped');

      return true;
    } catch (error) {
      this.logger.error("Errore durante l'arresto del nodo bootstrap:", error);
      throw error;
    }
  }


  async _propagateMessage(message, excludePeerId = null) {
    if (message) {
      this.logger.info('Messaggio propagato:', message);

    }
    try {
      const connectedPeers = this.networkManager.getConnectedPeers();
      for (const peer of connectedPeers) {
        if (peer.id !== excludePeerId) {
          await peer.send(message);
          this.logger.info(`Messaggio propagato al peer ${peer.id}: ${JSON.stringify(message)}`);
        }
      }
    } catch (error) {
      this.logger.error('Errore durante la propagazione del messaggio:', error);
    }
  }

  /**
   * Gestisce i messaggi in arrivo
   */
  _handleMessage(message, peer) {
    // Log dettagliato per diagnosticare la ricezione dei messaggi
    this.logger.info(`Messaggio ricevuto da ${peer.id}: ${JSON.stringify(message)}`);


  }

  /**
   * Restituisce statistiche di rete
   */
  async getNetworkStats() {
    return {
      nodeId: this.nodeId,
      peerId: this.networkManager.getPeerId(),
      connectedPeers: this.networkManager.getConnectedPeersCount(),
      uptime: this._getUptime(),
      addresses: this.networkManager.getAddresses(),
      p2pPort: this.config.p2p.port,

    };
  }

  /**
   * Calcola l'uptime del nodo in secondi
   */
  _getUptime() {
    // Se il nodo non è in esecuzione, l'uptime è 0
    if (!this.startTime) {
      return 0;
    }

    // Altrimenti calcola l'uptime come la differenza tra ora e il tempo di avvio
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

}