import { Node } from './core/Node1.js';
import { Logger } from './utils/logger.js';
import { Config } from './config/config.js';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs/promises';
import { displayBanner } from './utils/banner.js';
import { NodeStorage } from './utils/NodeStorage.js';
import { ConfigBuilder } from './utils/ConfigBuilder.js';

const logger = new Logger('RunnerService');

/**
 * Avvia un nodo Drakon non bootstrap.
 */
async function runNode(options = {}) {
  try {

    // Crea la configurazione di base
    const config = new Config();
    await config.initialize();


    // Imposta il percorso dati specifico per il bootstrap
    const nodeDataDir = options.dataDir || path.join(os.homedir(), '.drakon-node');

    // Assicurati che il percorso sia assoluto (importante per la persistenza)
    const absoluteDataDir = path.resolve(nodeDataDir);
    logger.info(`Percorso dati bootstrap (assoluto): ${absoluteDataDir}`);

    // Aggiorna config con il percorso dati 
    if (!config.config.storage) config.config.storage = {};
    config.config.storage.path = absoluteDataDir;

    // Assicurati che il nodo sia configurato come bootstrap
    if (!config.config.node) config.config.node = {};
    config.config.node.dataDir = absoluteDataDir; // Importante: imposta anche dataDir

    // Configura il nome del nodo con prefisso bootstrap
    if (!config.config.node.name || !config.config.node.name.startsWith('FULLNODE-')) {
      config.config.node.name = `FULLNODE-${crypto.randomBytes(4).toString('hex')}`;
    }

    // IMPORTANTE: Verifica se esistono informazioni salvate prima di generare un nuovo ID
    const nodeStorage = new NodeStorage(config.config);
    const savedInfo = await nodeStorage.loadNodeInfo();

    // Stampa informazioni dettagliate su cosa è stato trovato --DA TOGLIERE 
    logger.info(`Percorso storage: ${path.join(absoluteDataDir, 'storage')}`);
    logger.info(`File info nodo: ${path.join(absoluteDataDir, 'storage', 'node-info.json')}`);
    logger.info(`Informazioni salvate trovate: ${!!savedInfo}`);
    if (savedInfo) {
      logger.info(`Contenuto informazioni: ${JSON.stringify({
        nodeId: savedInfo.nodeId || 'non trovato ',
        hasPeerId: !!savedInfo.peerId,
        peerIdType: savedInfo.peerId ? typeof savedInfo.peerId : 'non trovato',
        peerIdComplete: savedInfo.peerId && typeof savedInfo.peerId === 'object' &&
          savedInfo.peerId.privKey && savedInfo.peerId.pubKey
      })}`);
    }

    if (savedInfo && savedInfo.nodeId) {
      logger.info(`Trovate informazioni salvate con ID: ${savedInfo.nodeId}`);
      // Usa l'ID salvato
      config.config.node.id = savedInfo.nodeId;
      logger.info(`Utilizzando ID nodo salvato: ${savedInfo.nodeId}`);

      // Verifica se abbiamo un PeerId salvato
      if (savedInfo.peerId) {
        logger.info(`Trovato anche PeerId salvato: ${typeof savedInfo.peerId === 'string' ? savedInfo.peerId : savedInfo.peerId.id}`);
        // Imposta esplicitamente nella configurazione che questo PeerId deve essere riutilizzato
        config.config.p2p = config.config.p2p || {};
        config.config.p2p.persistentPeerId = true;

        // Se abbiamo l'oggetto PeerId completo con chiavi, impostiamo anche quelle
        if (typeof savedInfo.peerId === 'object' && savedInfo.peerId.privKey && savedInfo.peerId.pubKey) {
          logger.info('Impostazione chiavi PeerId salvate per il riutilizzo');
          config.config.p2p.savedPeerId = savedInfo.peerId;
        }
      } else {
        logger.warn('ID nodo trovato ma PeerId mancante. Verrà generato un nuovo PeerId.');
      }
    } else {
      // Genera un ID univoco e stabile per questo nodo 
      logger.info('Nessuna informazione del nodo  trovata, verrà generato un nuovo ID');
      const nodeId = generateNodeId();
      config.config.node.id = nodeId;
      logger.info(`Generato nuovo ID bootstrap: ${nodeId}`);

      // Salva immediatamente l'ID per usi futuri
      await nodeStorage.saveNodeInfo({ nodeId });
      logger.info(`ID  salvato per usi futuri: ${nodeId}`);
    }


    // Imposta le porte P2P e API
    if (options.port) {
      config.config.p2p = config.config.p2p || {};
      config.config.p2p.port = options.port;
    }

    await ensureDirectories(config.config);


    // Mostra il banner
    displayBanner(config.config);

        // Aggiungiamo più log per il debug del PeerId
        logger.info('==== DEBUG AVVIO NODO BOOTSTRAP ====');
        logger.info(`ID Nodo: ${config.config.node.id}`);
        if (savedInfo && savedInfo.peerId) {
          logger.info(`PeerId salvato: ${savedInfo.peerId.id}`);
        } else {
          logger.info('Nessun PeerId salvato trovato');
        }
        logger.info('=====================================');
    
    // Usa ConfigBuilder per costruire la configurazione definitiva
    const configBuilder = new ConfigBuilder(config.config);
    const finalConfig = configBuilder
        .setNodeId(config.config.node.id)
        .setNodeName(config.config.node.name)
        .setDataDir(config.config.node.dataDir)
        .setP2PPort(config.config.p2p.port)
        .build();

    logger.info('Configurazione finale costruita:', finalConfig);

    // Crea e avvia il nodo con la configurazione finale
    const node = new Node(finalConfig);

    // Gestisci l'uscita pulita
    setupCleanShutdown(node);

    // Avvia il nodo
    await node.start();

    // Usa il nodeId dal nodo avviato, che sarà quello corretto
    logger.info(`DRAKON ENTER NODE avviato con successo - ID: ${config.config.node.id}`);
    logger.info(`Porta P2P: ${config.config.p2p.port}`);
    
    // Ottieni l'indirizzo IP corrente
    const publicIp = process.env.PUBLIC_IP || '127.0.0.1';
    const peerId = config.config.node.id;
    const port = config.config.p2p.port;
    
    // IMPORTANTE: Salva il PeerId per usi futuri, anche se è lo stesso di prima
    // Questo assicura che tutte le informazioni del PeerId vengano salvate correttamente
    // await nodeStorage.saveNodeInfo({
    //   nodeId: config.config.node.id,
    //   peerId: {
    //     id: peerId,
    //     privKey: config.config.p2p.savedPeerId ? config.config.p2p.savedPeerId.privKey : null,
    //     pubKey: config.config.p2p.savedPeerId ? config.config.p2p.savedPeerId.pubKey : null
    //   }
    // });
    // logger.info(`PeerId salvato per future esecuzioni: ${peerId}`);
    
    // Mostra l'indirizzo completo per la connessione
    logger.info('');
    logger.info('==== INFORMAZIONI DI CONNESSIONE AL NODO  ====');
    logger.info(`Indirizzo completo per connessione: /ip4/${publicIp}/tcp/${port}/p2p/${peerId}`);
    logger.info('Per connettersi a questo nodo bootstrap, utilizzare:');
    logger.info(`Host: ${publicIp}`);
    logger.info(`Porta: ${port}`);
    logger.info(`PeerId: ${peerId}`);
    logger.info('=============================================');
    logger.info('');
    
    logger.info(`Nodo di ingresso in ascolto per connessioni...`);

    // Mantieni il processo in esecuzione
    process.stdin.resume();

    return config;
  } catch (error) {
    logger.error("Errore durante l'avvio del nodo:", error);
    if (error.stack) {
      logger.error('Stack trace:', error.stack);
    }
    return false; // Restituisce false per consentire al chiamante di decidere cosa fare
  }
}


/**
 * Genera un ID univoco per il nodo.
 */
function generateNodeId() {
  const hostname = os.hostname();
  const macAddress = getMacAddress();
  const timestamp = Date.now();
  const randomValue = Math.random().toString();
  const data = `${hostname}-${macAddress}-${timestamp}-${randomValue}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Ottiene l'indirizzo MAC della prima interfaccia di rete non-loopback.
 */
function getMacAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Crea le directory necessarie.
 */
async function ensureDirectories(config) {
  try {
    const baseDir = config.storage.path;

    // Crea la directory di storage base
    await fs.mkdir(baseDir, { recursive: true });

    // Crea la directory logs sotto .drakon-node
    const logDir = path.join(baseDir, 'logs');
    await fs.mkdir(logDir, { recursive: true });

    // Crea la directory data sotto .drakon-node
    const dataDir = path.join(baseDir, 'data');
    await fs.mkdir(dataDir, { recursive: true });

    // Crea la directory specifica del nodo
    const nodeDataDir = path.join(dataDir, config.node.id);
    await fs.mkdir(nodeDataDir, { recursive: true }); 

    logger.debug('Directory create con successo in', baseDir);
  } catch (error) {
    logger.error('Errore nella creazione delle directory:', error);
    throw error;
  }
}


/**
 * Configura la gestione dell'uscita pulita.
 */
function setupCleanShutdown(node) {
  process.on('SIGINT', async () => {
    logger.info('Ricevuto segnale di interruzione, arresto del nodo...');
    await node.stop();
    process.stdin.pause();
    logger.info('Nodo arrestato con successo');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Ricevuto segnale di terminazione, arresto del nodo...');
    await node.stop();
    process.stdin.pause();
    logger.info('Nodo arrestato con successo');
    process.exit(0);
  });

  process.on('uncaughtException', async error => {
    logger.error('Eccezione non catturata:', error);
    try {
      await node.stop();
      process.stdin.pause();
      logger.info("Nodo arrestato a causa di un'eccezione non catturata");
    } catch (stopError) {
      logger.error("Errore durante l'arresto del nodo:", stopError);
    }
    process.exit(1);
  });
}

// Se lo script è eseguito direttamente, avvia il nodo
if (process.argv[1].endsWith('node-runner2.js')) {
  const options = parseCommandLineArgs();
  runNode(options)
    .then(() => {
      console.log('Nodo avviato correttamente.');
    })
    .catch(err => {
      console.error('Errore durante l\'avvio del nodo:', err.message);
      process.exit(1);
    });
}

/**
 * Analizza gli argomenti da riga di comando.
 */
function parseCommandLineArgs() {
  const options = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && i + 1 < args.length) {
      options.port = parseInt(args[++i]);
    } else if (arg === '--data-dir' && i + 1 < args.length) {
      options.dataDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

/**
 * Mostra l'aiuto per l'utilizzo dello script.
 */
function showHelp() {
  console.log(`
Drakon Node Runner 2
====================

Uso: node src/node-runner2.js [opzioni]

Opzioni:
  --port NUM              Porta P2P (la porta API sarà PORT+1000)
  --data-dir PATH         Directory per i dati del nodo
  --help, -h              Mostra questo aiuto

Esempi:
  node src/node-runner2.js --port 6001
  node src/node-runner2.js --port 6001 --data-dir ./node-data
  `);
}

export { runNode };
