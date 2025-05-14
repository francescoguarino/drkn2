// PeerId
import { createEd25519PeerId as createNewPeerId, createFromPrivKey } from '@libp2p/peer-id-factory'

// Decodifica chiave privata
import { unmarshalPrivateKey } from '@libp2p/crypto/keys'

// Moduli libp2p
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@libp2p/noise'
import { mplex } from '@libp2p/mplex'
import { bootstrap } from '@libp2p/bootstrap'
import { multiaddr } from '@multiformats/multiaddr'


// Utils per messaggi
import { fromString as uint8ArrayFromString, toString as uint8ArrayToString } from 'uint8arrays'
import { EventEmitter } from 'events'

import { Logger } from '../utils/logger.js'
import { NodeStorage } from '../utils/NodeStorage.js'
import { kadDHT } from '@libp2p/kad-dht'

const peers = [];

export class BootstrapNetworkManager extends EventEmitter {
    constructor(config ){
        super();
        this.logger = new Logger('Bootstrap.network');
        this.storage = new NodeStorage(config);
        this.config = {
            port: 6001,
           bootstrap: [], //implementare lista bootstrap per auto connessione fra di loro 
           ...config
        }
        this.peers = new Set();
        this.stats = {
            peers: 0,
            connections: 0,
            errors: 0,
            helpedPeers:0,
        }
    }


        /**
     * Carica un PeerId esistente o ne crea uno nuovo
     * @returns {Promise<PeerId>} - Oggetto PeerId
     */
        async loadOrCreatePeerId() {
            try {
                // Carica le informazioni esistenti
                const nodeInfo = await this.storage.loadNodeInfo();
                // this.logger.info('Informazioni nodo caricate: ' + JSON.stringify({
                //     hasNodeInfo: !!nodeInfo,
                //     nodeId: nodeInfo?.nodeId || 'non presente',
                //     hasPeerId: !!nodeInfo?.peerId,
                //     peerIdType: nodeInfo?.peerId ? typeof nodeInfo.peerId : 'non presente'
                // }));
    
                // Se abbiamo informazioni salvate con un PeerId, proviamo a usarle
                if (nodeInfo && nodeInfo.peerId) {
                    this.logger.info('Trovato PeerId salvato, tentativo di riutilizzo...');
    
                    try {
                        // Verifichiamo che abbiamo la chiave privata
                        if (typeof nodeInfo.peerId === 'object' && nodeInfo.peerId.privKey) {
                          //  this.logger.info('Chiavi private trovate, tentativo di ricostruzione PeerId...');
    
                            try {
                                // Converti la chiave da base64 a buffer
                                const privKeyStr = nodeInfo.peerId.privKey;
                                const privKeyBuffer = Buffer.from(privKeyStr, 'base64');
    
                             //   this.logger.info(`Chiave privata: ${privKeyBuffer.length} bytes (in base64: ${privKeyStr.substring(0, 10)}...)`);
    
                                // Decodifica la chiave privata e crea il PeerId
                                const privKey = await unmarshalPrivateKey(privKeyBuffer);
                                const peerId = await createFromPrivKey(privKey);
    
                                this.logger.info(`PeerId creato con successo: ${peerId.toString()}`);
    
                                // Verifica corrispondenza con l'ID salvato
                                if (peerId.toString() !== nodeInfo.peerId.id) {
                                    this.logger.warn(`⚠️ Il PeerId generato (${peerId.toString()}) non corrisponde all'ID salvato (${nodeInfo.peerId.id})`);
                                    this.logger.warn('Questo potrebbe essere causato da cambiamenti nelle librerie libp2p. Utilizzerò comunque il nuovo PeerId generato.');
                                    // Aggiorna l'ID nel nodeInfo per i futuri caricamenti
                                    nodeInfo.peerId.id = peerId.toString();
                                    await this.storage.saveNodeInfo(nodeInfo);
                                    this.logger.info(`Informazioni nodo aggiornate con il nuovo PeerId: ${peerId.toString()}`);
                                }
    
                                return peerId;
                            } catch (importError) {
                                this.logger.error(`Errore importazione chiave: ${importError.message}`);
                                throw importError;
                            }
                        } else if (typeof nodeInfo.peerId === 'string') {
                            // Qui abbiamo solo l'ID come stringa, senza chiavi
                            this.logger.warn('Solo ID PeerId trovato senza chiavi private, impossibile riutilizzare lo stesso PeerId');
                            throw new Error('PeerId senza chiavi private non utilizzabile');
                        } else {
                            this.logger.warn('Formato PeerId salvato non riconoscibile');
                            throw new Error('Formato PeerId non valido');
                        }
                    } catch (error) {
                        this.logger.error(`Errore nel caricamento del PeerId: ${error.message}`);
                        this.logger.info('Sarà generato un nuovo PeerId');
                        // Fallback a creazione nuovo PeerId
                        return await createNewPeerId();
                    }
                } else {
                    // Nessun PeerId trovato, ne creiamo uno nuovo
                    this.logger.info('Nessun PeerId trovato, creazione nuovo PeerId');
                    return await createNewPeerId();
                }
            } catch (error) {
                this.logger.error(`Errore generale in loadOrCreatePeerId: ${error.message}`);
                // Fallback finale: crea un nuovo PeerId
                return await createNewPeerId();
            }
        }

    /**
     * Gestisce la connessione di un nuovo nodo al nodo bootstrap
     * @param {Object} newNode - Informazioni sul nuovo nodo
     */
    handleNewNodeConnection(newNode) {
        this.logger.info(`Nuovo nodo connesso: ${newNode.id}`);
        this.peers.add(newNode);
        this.stats.peers++;

        // Invia i peer noti al nuovo nodo
        this.sendKnownPeers(newNode);

        // Emette un evento per la connessione del nuovo nodo
        this.emit('newNodeConnected', newNode);
    }

    /**
     * Invia la lista dei peer noti a un nodo specifico
     * @param {Object} targetNode - Nodo destinatario
     */
    sendKnownPeers(targetNode) {
        const knownPeers = Array.from(this.peers).map(peer => ({ id: peer.id, address: peer.address }));
        this.logger.info(`Invio di ${knownPeers.length} peer noti al nodo ${targetNode.id}`);

        // Simula l'invio dei peer noti (da implementare con il protocollo di rete)
        targetNode.receiveKnownPeers(knownPeers);
    }

    /**
     * Aggiorna la lista dei peer quando un nuovo nodo si collega
     * @param {Object} newNode - Informazioni sul nuovo nodo
     */
    updatePeerList(newNode) {
        if (!this.peers.has(newNode)) {
            this.peers.add(newNode);
            this.logger.info(`Peer aggiunto: ${newNode.id}`);

            // Emette un evento per notificare l'aggiornamento della lista dei peer
            this.emit('peerListUpdated', Array.from(this.peers));
        } else {
            this.logger.info(`Il peer ${newNode.id} è già presente nella lista.`);
        }
    }

    /**
     * Configura i gestori per tutti gli eventi
     */
    setupHandlers() {
        // Gestisce l'evento di connessione di un nuovo nodo
        this.on('newNodeConnected', (newNode) => {
            this.logger.info(`Gestore evento: nuovo nodo connesso - ID: ${newNode.id}`);
            this.updatePeerList(newNode);
        });

        // Gestisce l'evento di aggiornamento dei peer
        this.on('peersUpdated', (peers) => {
            this.logger.info(`Gestore evento: lista dei peer aggiornata con ${peers.length} peer.`);
        });

        // Gestisce l'evento di aggiornamento della lista dei peer
        this.on('peerListUpdated', (peerList) => {
            this.logger.info(`Gestore evento: lista dei peer aggiornata. Totale peer: ${peerList.length}`);
        });

        
    }

      /**
       * Ottiene l'indirizzo IP della macchina preferendo indirizzi pubblici o non-localhost
       * @private
       * @returns {string} Indirizzo IP
       */
      getLocalIpAddress() {
        try {
          // Controlla se è stato impostato un IP pubblico tramite variabile d'ambiente
          if (process.env.PUBLIC_IP) {
            this.logger.info(`Usando indirizzo IP pubblico da variabile d'ambiente: ${process.env.PUBLIC_IP}`);
            return process.env.PUBLIC_IP;
          }
          
          const networkInterfaces = os.networkInterfaces();
          
          // Cerca un'interfaccia non-localhost IPv4
          for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
              // Prendi solo gli indirizzi IPv4 che non sono loopback e non sono di interfacce virtuali
              if (iface.family === 'IPv4' && !iface.internal && 
                  !interfaceName.startsWith('vEthernet') && 
                  !interfaceName.startsWith('Docker') && 
                  !interfaceName.startsWith('WSL')) {
                this.logger.info(`Trovato indirizzo IP: ${iface.address} (${interfaceName})`);
                return iface.address;
              }
            }
          }
          
          // Fallback: usa l'indirizzo pubblico
          this.logger.warn('Nessun indirizzo IP non-locale trovato, uso 0.0.0.0');
          return '0.0.0.0';
        } catch (error) {
          this.logger.error(`Errore nel recupero dell'indirizzo IP: ${error.message}`);
          return '0.0.0.0';
        }
      }






    async start() {
        this.logger.info('AVVIO DEL BOOTSTRAP NETWORK MANAGER');

        let nodeInfo = await this.storage.loadNodeInfo();


        if (nodeInfo && nodeInfo.nodeId) {
            this.logger.info(`Caricate informazioni del NODE_ID.....`);
            this.nodeId = nodeInfo.nodeId;


            if (nodeInfo.peerId) {
                this.logger.info('TROVATE INFORMAZIONI DEL PEER_ID, TENTATIVO DI RIUTILIZZAZIONE...');
                this.peerId = await this.loadOrCreatePeerId();
                
            }
        } else {
            this.logger.info('NESSUNA INFORMAZIONE DEL PEER_ID TROVATA');
            this.peerId = await this.loadOrCreatePeerId();
        }

        // Implementa il salvataggio delle informazioni
        await this.storage.saveNodeInfo({
            nodeId: this.nodeId,
            peerId: {
                id: this.peerId.toString(),
                privKey: Buffer.from(this.peerId.privateKey).toString('base64'),
                pubKey: Buffer.from(this.peerId.publicKey).toString('base64')
            }
        });

        //SISTEMA DI IMPOSTAZIONE IP LOCALE E O PUBBLICO IMPOSTATO DALLE OPTIONS 

        const listenAddresses = [];

        if (this.config.mode !== 'localhost-only') {
            const localIp = this.getLocalIpAddress();
            if (localIp) {
              listenAddresses.push(`/ip4/${localIp}/tcp/${this.port}`);
            }
          }

        this.node = await createLibp2p({
            peerId: this.peerId,
            addresses: {
                listen:listenAddresses
            },
            transports: [
                tcp()
            ],
            connectionEncryption: [
                noise()
            ],
            streamMuxers: [
                mplex()
            ],
            peerDiscovery: [
                bootstrap(bootstrapconfigexport)
            ],
            
            
            
        })






    }
}