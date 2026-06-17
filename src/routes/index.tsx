import { createFileRoute } from '@tanstack/react-router'
import { Configurator } from '../components/Configurator'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <Configurator />
    </main>
  )
}
