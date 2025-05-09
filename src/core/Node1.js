import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { PeerManager } from '../network/PeerManager.js';
import { SyncManager } from '../consensus/SyncManager.js';
import { GossipManager } from '../consensus/GossipManager.js';
import { NodeStorage } from '../utils/NodeStorage.js';
import crypto from 'crypto';
import path from 'path';
import { DHTManager } from '../network/DHT.js';
import { createEd25519PeerId as createNewPeerId, createFromPrivKey } from '@libp2p/peer-id-factory';
import { unmarshalPrivateKey } from '@libp2p/crypto/keys';


export class Node extends EventEmitter {
        constructor(config) {
        super();
        if(!config) {
            throw new Error('Configurazione non valida');
        }
        this.config = this._validateAndEnrichConfig(config);
        this.logger = new Logger('Node1');
        this.storage = new NodeStorage(this.config);


        this.bannerDisplayed = config.bannerDisplayed || false;

        if (config.bannerDisplayed) {
          this.logger.debug('Banner già mostrato, non verrà visualizzato di nuovo');
        }


    try {
        this.networkManager = new NetworkManager(this.config);
        this.peerManager = new PeerManager(this.config);
        this.syncManager = new SyncManager(this.config);
        this.gossipManager = new GossipManager(this.config);
        this.dhtManager = new DHTManager(this.config);
    } catch (error) {
        this.logger.error('Errore durante l\'inizializzazione dei manager:', error);
    }        
  } // END-constructor


  /**
   * Valida e arricchisce la configurazione per garantire che tutte le proprietà necessarie esistano
   * @param {Object} config - Configurazione iniziale
   * @returns {Object} - Configurazione validata e arricchita
   */
      _validateAndEnrichConfig(config) {
        // Copia profonda per non modificare l'oggetto originale
        const validatedConfig = JSON.parse(JSON.stringify(config));
    
        // Assicurati che tutte le sezioni di configurazione principali esistano
        // Node
        if (!validatedConfig.node) {
          validatedConfig.node = {
            id: crypto.randomBytes(16).toString('hex'),
            name: `node-${crypto.randomBytes(4).toString('hex')}`
          };
        } else if (!validatedConfig.node.id) {
          // Se esiste la sezione node ma manca id, generalo
          validatedConfig.node.id = crypto.randomBytes(16).toString('hex');
        }
    
        // Blockchain
      
    
        // Wallet

    
        // Storage
        if (!validatedConfig.storage) {
          validatedConfig.storage = {
            path: path.join(process.cwd(), 'db', validatedConfig.node.id || 'node'),
            maxSize: 1024 * 1024 * 100, // 100MB
            options: { valueEncoding: 'json' }
          };
        } else {
          if (!validatedConfig.storage.maxSize) {
            validatedConfig.storage.maxSize = 1024 * 1024 * 100; // 100MB
          }
          if (!validatedConfig.storage.options) {
            validatedConfig.storage.options = { valueEncoding: 'json' };
          }
        }
    
        // Mempool

    
        // Gossip
        if (!validatedConfig.gossip) {
          validatedConfig.gossip = {
            interval: 5000,
            maxPeersPerGossip: 3
          };
        }
    
        // Network
        if (!validatedConfig.network) {
          validatedConfig.network = {
            type: 'testnet',
            maxPeers: 50,
            peerTimeout: 30000
          };
        } else {
          if (!validatedConfig.network.maxPeers) {
            validatedConfig.network.maxPeers = 50;
          }
          if (!validatedConfig.network.peerTimeout) {
            validatedConfig.network.peerTimeout = 30000;
          }
        }
    
        return validatedConfig;
      }

      async loadOrCreatePeerId() {
        try {
          this.logger.info('🔄 Avvio procedura: loadOrCreatePeerId');
      
          // Carica le informazioni esistenti
          const nodeInfo = await this.storage.loadNodeInfo();
          this.logger.info('📦 Informazioni nodo caricate: ' + JSON.stringify({
            nodeInfoPresente: !!nodeInfo,
            nodeId: nodeInfo?.nodeId || 'non presente',
            peerIdPresente: !!nodeInfo?.peerId,
            tipoPeerId: nodeInfo?.peerId ? typeof nodeInfo.peerId : 'non presente'
          }));
      
          // Se abbiamo informazioni salvate con un PeerId
          if (nodeInfo && nodeInfo.peerId) {
            this.logger.info('📁 PeerId trovato nel salvataggio precedente. Avvio procedura di ricostruzione...');
      
            try {
              // Caso: oggetto con chiave privata
                  if (typeof nodeInfo.peerId === 'object' && nodeInfo.peerId.privKey) {
                this.logger.info('🔐 Chiave privata rilevata. Tentativo di ricostruzione del PeerId in corso...');
                const privKeyStr = nodeInfo.peerId.privKey;
                const privKeyBuffer = Buffer.from(privKeyStr, 'base64');
                this.logger.info(`📏 Dimensione chiave privata decodificata: ${privKeyBuffer.length} byte`);
      
                const privKey = await unmarshalPrivateKey(privKeyBuffer);
                const peerId = await createFromPrivKey(privKey);
                this.logger.info(`✅ PeerId ricostruito: ${peerId.toString()}`);
      
                if (peerId.toString() !== nodeInfo.peerId.id) {
                  this.logger.warn(`⚠️ Disallineamento: PeerId generato (${peerId.toString()}) ≠ salvato (${nodeInfo.peerId.id})`);                  this.logger.warn('🛠️ Aggiornamento ID salvato per allineamento con nuovo PeerId');
                  nodeInfo.peerId.id = peerId.toString();
                  await this.storage.saveNodeInfo(nodeInfo);
                  this.logger.info(`💾 Informazioni nodo aggiornate con nuovo PeerId: ${peerId.toString()}`);
                }
      
                return peerId;
      
              } else if (typeof nodeInfo.peerId === 'string') {
                this.logger.warn('⚠️ Trovato solo l\'ID del PeerId senza chiave privata. Non è possibile ricostruirlo.');
                throw new Error('PeerId senza chiavi private non utilizzabile');
              } else {          
                this.logger.warn('⚠️ Formato del PeerId salvato non riconosciuto. Ricostruzione non possibile.');
                throw new Error('Formato PeerId non valido');
              }
            } catch (error) {
              this.logger.error(`❌ Errore durante il caricamento del PeerId salvato: ${error.message}`);
              this.logger.info('↩️ Procedo con la creazione di un nuovo PeerId');
              return await createNewPeerId();
            }
      
          } else {
            this.logger.info('📭 Nessun PeerId salvato trovato. Creazione di un nuovo PeerId in corso...');
            return await createNewPeerId();
          }
      
        } catch (error) {
          this.logger.error(`🔥 Errore generale in loadOrCreatePeerId: ${error.message}`);
          this.logger.info('🆕 Fallback: generazione di un nuovo PeerId');
          return await createNewPeerId();
        }
      }
      
      async  createNewPeerId() {
        const peerId = await createEd25519PeerId(); // o qualsiasi metodo tu stia usando
      
        const nodeInfo = {
          peerId: {
            id: peerId.toString(),
            privKey: peerId.privateKey ? Buffer.from(peerId.privateKey).toString('base64') : null
          },
          createdAt: new Date().toISOString()
        };
      
        await this.storage.saveNodeInfo(nodeInfo);
        this.logger.info(`🆕 Nuovo PeerId creato e salvato: ${peerId.toString()}`);
        return peerId;
      }
    

    async start(){
        try {
            this.logger.info('Avvio del nodo1...');

            const savedInfo = await this.storage.loadNodeInfo();

            //PEER ID
            const peerId = await this.loadOrCreatePeerId();
            this.config.peerId = peerId;

            //NODE ID 
            if (savedInfo && savedInfo.nodeId) {
                this.config.node.id = savedInfo.nodeId;
                this.logger.info(`ID-NODO caricato: ${this.config.node.id}`);
            }
            // p2p PORT 
            if (savedInfo && savedInfo.p2pport) {
                this.config.p2p.port = savedInfo.p2pport;
                this.logger.info(`Porta P2P caricata: ${this.config.p2p.port}`);
            }

            this.createdAt = new Date(savedInfo.createdAt);
            this.lastUpdated = new Date(savedInfo.lastUpdated);


            //INIZIALIZZAZIONE 
           // this.networkManager.peerId = this.peerId;

            await this.networkManager.start();
            await this.peerManager.start();
            await this.syncManager.start();
            await this.gossipManager.start();
            await this.dhtManager.start();

            this.logger.info('Nodo Drakon avviato con successo');

        } catch (error) {
            this.logger.error('Errore durante l\'avvio del nodo1:', error);
        }
    }

    async stop() {
        try {
          this.logger.info('Arresto del nodo Drakon...');
    
    
    
          // Ferma il miner

    
          // Ferma il gossip manager
          if (this.gossipManager) {
            await this.gossipManager.stop();
          }
    
          // Ferma il sync manager
          if (this.syncManager) {
            await this.syncManager.stop();
          }
    
          // Ferma il network manager
          if (this.networkManager) {
            await this.networkManager.stop();
          }
    
          // Chiudi il database

    
          this.isRunning = false;
          this.logger.info('Nodo Drakon arrestato con successo!');
        } catch (error) {
          this.logger.error("Errore durante l'arresto del nodo:", error);
          throw error;
        }
      }
    

    _getUptime() {
        return process.uptime();
      }

}