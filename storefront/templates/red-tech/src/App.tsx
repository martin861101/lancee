import Header from "./Header"
import Hero from "./Hero"
import Services from "./Services"
import Stats from "./Stats"
import About from "./About"
import CTA from "./CTA"
import Footer from "./Footer"

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