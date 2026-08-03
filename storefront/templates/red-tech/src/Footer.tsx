export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <strong>hookit-easy</strong>
          <span>React Templates</span>
        </div>
        <div className="footer-links">
          <a href="#home">Home</a>
          <a href="#services">Services</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </div>
        <p className="footer-copy">&copy; {new Date().getFullYear()} hookit-easy — all rights reserved</p>
      </div>
    </footer>
  );
}