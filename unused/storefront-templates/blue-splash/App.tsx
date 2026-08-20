import Header from './components/Header'
import Hero from './components/Hero'
import Services from './components/Services'
import Stats from './components/Stats'
import About from './components/About'
import CTA from './components/CTA'
import Footer from './components/Footer'

function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Services />
        <Stats />
        <About />
        <CTA />
      </main>
      <Footer />
    </>
  )
}

export default App
