export function WelcomeScreen() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 40, textAlign: 'center',
      background: 'var(--bg-chat)',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'var(--accent)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 36, fontWeight: 700, color: 'var(--avatar-text)',
        marginBottom: 24,
      }}>P</div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
        P2P Messenger
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 320, lineHeight: 1.5 }}>
        Выберите чат слева или введите ID собеседника, чтобы начать защищённое общение
      </p>
    </div>
  );
}
