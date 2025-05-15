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

    // Debug info
    this.logger.debug(
      'Inizializzazione del nodo bootstrap con la configurazione:',
      JSON.stringify(
        {
          nodeId: this.config.node?.id,
          p2pPort: this.config.p2p?.port,
          //apiPort: this.config.api?.port
        },
        null,
        2
      )
    );

    try {
      // Il nodo bootstrap necessita solo di NetworkManager e APIServer
      this.networkManager = new MinimalNetworkManager(this.config, this.storage);
    //  this.apiServer = new APIServer(this.config, this);
      
      this._setupEventHandlers();
    } catch (error) {
      this.logger.error("Errore durante l'inizializzazione del nodo bootstrap:", error);
      throw error;
    }
  }

  /**
   * Avvia il nodo bootstrap
   */
  async start() {
    try {
      this.logger.info('Avvio del nodo bootstrap Drakon...');





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

  /**
   * Configura i gestori di eventi
   */
  _setupEventHandlers() {
    // Gestione eventi di rete
    this.networkManager.on('peer:connect', (peer) => {
      if (!peer || !peer.id) {
        this.logger.warn('⚠️ Evento peer:connect ricevuto senza peer.id definito');
        return;
      }

      this.logger.info(`Nuovo peer connesso: ${peer.id}`);

      // Propaga il messaggio di connessione agli altri peer
      this._propagateMessage({
        type: 'NEW_PEER_CONNECTED',
        payload: {
          peerId: peer.id,
          timestamp: Date.now()
        }
      }, peer.id);

      // Propaga l'evento
      this.emit('peer:connect', peer);
    });

    this.networkManager.on('peer:disconnect', (peer) => {
      if (!peer || !peer.id) {
        this.logger.warn('⚠️ Evento peer:disconnect ricevuto senza peer.id definito');
        return;
      }
      
      this.logger.info(`Peer disconnesso: ${peer.id}`);
      this.emit('peer:disconnect', peer);
    });

    this.networkManager.on('message', (message, peer) => {
      if (!peer || !peer.id) {
        this.logger.warn('⚠️ Evento message ricevuto senza peer.id definito');
        return;
      }
      
      this.logger.debug(`Messaggio ricevuto da ${peer.id}: ${message ? message.type : 'undefined'}`);
      this.emit('message', message, peer);
      
      // Gestione semplice dei messaggi
      this._handleMessage(message, peer);
    });
  }

  async _propagateMessage(message, excludePeerId = null) {
    if (message ) {
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