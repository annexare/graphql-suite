import type { ReactNode } from 'react'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <header
        style={{
          padding: '16px 0',
          borderBottom: '1px solid #e5e5e5',
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>News App</h1>
        <p style={{ fontSize: 14, color: '#666' }}>graphql-suite example</p>
      </header>
      <main>{children}</main>
    </div>
  )
}
