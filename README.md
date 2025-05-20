# Drakon Network

Drakon è una rete blockchain peer-to-peer progettata per essere scalabile, sicura e facile da usare. Questo repository contiene il codice sorgente per un nodo Drakon, eseguibile su qualsiasi sistema con Node.js.

## Caratteristiche principali

- Blockchain da completare con supporto per transazioni e mining opzionale
- Rete P2P basata su [libp2p](https://libp2p.io/)
- Scoperta automatica dei peer tramite nodi bootstrap e DHT
- API REST per interagire con il nodo
- Gestione integrata dei wallet
- Sincronizzazione automatica della blockchain tra nodi

## Requisiti

- Node.js v14 o superiore
- NPM v6 o superiore


## Avvio di un nodo

### Nodo Full (standard)

Per avviare un nodo Drakon standard (full node):

```bash
node src/node-runner.js
```



#### Opzioni di avvio

Puoi personalizzare il nodo tramite variabili d’ambiente o argomenti da riga di comando:

- `API_PORT`: Porta per l’API REST (default: 7001)
- `P2P_PORT` o `--port`: Porta per la rete P2P (default: 6001)
- `DATA_DIR` o `--data-dir`: Directory dati (default: ~/.drakon-node)
- `MINING_ENABLED`: Abilita il mining (default: false)
- `BOOTSTRAP_NODES`: Lista di nodi bootstrap in formato JSON
- `IS_BOOTSTRAP`: Imposta il nodo come bootstrap (default: false)

Esempio:

```bash
API_PORT=8080 P2P_PORT=9000 MINING_ENABLED=true node src/index.js
```



### Nodo Bootstrap

Per avviare un nodo di ingresso (bootstrap node), che facilita la scoperta dei peer:

```bash
PUBLIC_IP=34.147.53.15 node src/bootstrap-runner.js --port 6001 --data-dir ./bootstrap-data
```

Il file [`src/bootstrap-runner.js`](src/bootstrap-runner.js) importa e utilizza la classe [`BootstrapNode`](src/core/BootstrapNode.js) e gestisce la persistenza di PeerId e configurazione tramite [`NodeStorage`](src/utils/NodeStorage.js).

### Differenza tra i due runner

- **`node-runner.js`**: Avvia un nodo completo (full node) che partecipa alla blockchain, può minare e gestisce transazioni.
- **`bootstrap-runner.js`**: Avvia un nodo di ingresso che facilita la scoperta e connessione dei peer, ma non partecipa direttamente alla blockchain o al mining.

## Connessione tra nodi

   

## Nodi bootstrap predefiniti

La rete Drakon include due nodi bootstrap pubblici già configurati:

```
Server 1: // //  //   //     ///
Server 2: 34.147.53.15:6001 (ID: 12D3KooWPvDR3QboCJAZ2W1MyMCaVBnA73hKHQj22QudgJRzDRvz)
```

I nuovi nodi si connettono automaticamente a questi server, ma puoi forzare la connessione manuale:

```bash
BOOTSTRAP_NODES='{'/ip4/34.147.53.15/tcp/6001/p2p/12D3KooWPvDR3QboCJAZ2W1MyMCaVBnA73hKHQj22QudgJRzDRvz'}]'
```

## API REST // DA RIPRISTINARE

Il nodo espone un’API REST (default: porta 7001):

- `GET /status`: Stato del nodo
- `GET /blocks`: Elenco blocchi
- `GET /peers`: Peer connessi
- `POST /transactions`: Nuova transazione

## Persistenza dei dati

Tutti i dati sono salvati nella directory `.drakon-node` (o quella specificata):

- `storage/node-info.json`:  Dati necessari all'avvio e riavvio di un nodo
- `data/`: Database blockchain
- `wallet/`: File wallet
- `peer-id/`: Identificativo permanente del nodo
- `known-peers.json`: Cache peer conosciuti

## Risoluzione dei problemi

### Il nodo non si connette

- Verifica che le porte 6001 (P2P)  siano aperte nel firewall
- Controlla che l’IP del bootstrap sia raggiungibile
- Assicurati che il PeerId sia corretto

### Errore "Transport could not listen on any available address"

- La porta è già in uso: cambia porta con `P2P_PORT` o `--port`
- Permessi insufficienti: verifica i permessi dell’utente



## Contatti

Per assistenza o per entrare in contatto con gli sviluppatori:

- Francesco Guarino - guarinofrancesco42@gmail.com

## Licenza

Questo progetto è sotto licenza MIT - vedi il file [LICENSE](LICENSE) per i dettagli.