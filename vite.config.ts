import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const certificatePath = fileURLToPath(new URL('./.cert/dev-cert.pem', import.meta.url))
const privateKeyPath = fileURLToPath(new URL('./.cert/dev-key.pem', import.meta.url))

export default defineConfig(({ command, isPreview }) => ({
  server: command === 'serve' && !isPreview ? {
    host: '0.0.0.0',
    https: {
      cert: readFileSync(certificatePath),
      key: readFileSync(privateKeyPath),
    },
  } : undefined,
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        guestbook: 'guestbook.html',
        anyma: 'anyma.html',
        game: 'game.html',
        claw: 'claw.html',
        sampler: 'sampler.html',
        facePaint: 'face-paint.html',
        bakery: 'bakery.html',
        practice: 'practice/index.html',
        personalPractice: 'personal-practice/index.html',
        prismPractice: 'personal-practice/prism/index.html',
        lemonade: 'lemonade.html',
        water: 'water.html',
        balloon: 'balloon.html',
        airPottery: 'air-pottery.html',
        asmr: 'asmr.html',
        typeVessel: 'type-vessel.html',
        rubberHuman: 'rubber-human.html',
        shampoo: 'shampoo.html',
        doodleface: 'doodleface.html',
        prismFace: 'prism-face.html',
        littleUniverse: 'little-universe.html',
        faceMatch: 'face-match.html',
        paperFace: 'paper-face.html',
        expressionLab: 'expression-lab.html',
        seasonForest: 'season-forest.html',
      },
    },
  },
}))
