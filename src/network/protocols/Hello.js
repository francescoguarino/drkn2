// protocols/hello.js
export function HelloProtocol() {
  return {
    protocol: '/drakon/hello/1.0.0',
    handler: async ({ stream }) => {
      let msg = ''
      for await (const chunk of stream.source) {
        msg += chunk.toString()
      }

      console.log('[handler] Ricevuto:', msg)

      const response = 'Ciao da B!'
      await stream.sink([response])
    }
  }
}