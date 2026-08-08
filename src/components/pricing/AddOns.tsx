import { addOns } from './pricing-data'

export default function AddOns() {
  return (
    <section className="pricing-addons" aria-labelledby="addons-heading">
      <div className="pricing-section-heading">
        <span className="micro-label">Build your workspace</span>
        <h2 id="addons-heading">Add capacity on your terms</h2>
        <p>Most plans cover the essentials. Add modules only when your work needs them.</p>
      </div>
      <ul className="pricing-addons__grid">
        {addOns.map((addOn) => (
          <li key={addOn.id} className="pricing-addon">
            <span className="pricing-addon__plus" aria-hidden="true">+</span>
            <div>
              <strong>{addOn.name}</strong>
              <p>{addOn.kind}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}