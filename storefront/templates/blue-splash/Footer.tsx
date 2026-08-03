export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <strong>Hookit Easy</strong>
          <span>React Templates</span>
        </div>
        <div className="footer-links">
          <a href="#home">Home</a>
          <a href="#services">Services</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </div>
        <p className="footer-copy">&copy; {new Date().getFullYear()} Hookit Easy. All rights reserved.</p>
      </div>
    </footer>
  )
}
