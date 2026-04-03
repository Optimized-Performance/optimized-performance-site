export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <div style={styles.left}>
          <p style={styles.brand}>OPTIMIZED PERFORMANCE INC.</p>
          <p style={styles.disclaimer}>
            All products are strictly for research use only. Not for human consumption.
            Not a drug, food, or cosmetic. Must be 21+ to purchase.
          </p>
        </div>
        <div style={styles.right}>
          <p style={styles.link}>Shop</p>
          <p style={styles.link}>Contact</p>
          <p style={styles.link}>Terms of Service</p>
          <p style={styles.link}>Privacy Policy</p>
        </div>
      </div>
      <div style={styles.bottom}>
        <p style={styles.copy}>&copy; {new Date().getFullYear()} Optimized Performance Inc. All rights reserved.</p>
      </div>
    </footer>
  );
}

const styles = {
  footer: {
    backgroundColor: '#0A1525',
    color: '#5A7D9A',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    marginTop: 'auto',
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '40px 24px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 32,
  },
  left: {
    maxWidth: 420,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 12,
    marginTop: 0,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#5A7D9A',
    margin: 0,
  },
  right: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  link: {
    margin: 0,
    fontSize: 13,
    color: '#90CAF9',
    cursor: 'pointer',
  },
  bottom: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '16px 24px',
    borderTop: '1px solid rgba(90,125,154,0.2)',
  },
  copy: {
    margin: 0,
    fontSize: 11,
    color: '#3A5570',
    letterSpacing: 0.5,
  },
};
