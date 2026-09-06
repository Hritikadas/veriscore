import {
  IconCube,
  IconShield,
  IconLink,
  IconCheck,
  IconDoc
} from "./icons.jsx";
import useReveal from "./useReveal.js";

function ChainGlyph() {
  return (
    <span className="mini-blocks" aria-hidden="true">
      <span className="mini-block">
        <IconCube width={12} height={12} />
      </span>
      <span className="join" />
      <span className="mini-block">
        <IconCube width={12} height={12} />
      </span>
      <span className="join" />
      <span className="mini-block live">
        <IconCheck width={12} height={12} />
      </span>
    </span>
  );
}

export default function BlockchainPanel() {
  const ref = useReveal();

  return (
    <section className="section reveal" ref={ref} id="onchain">
      <div className="section-head">
        <span className="eyebrow">Decentralized</span>
        <h2>On-Chain Verification</h2>
        <p>Verify the same cryptographic proof through a smart contract.</p>
      </div>

      <div className="card arch-card">
        <div className="chain-pipeline" aria-label="On-chain verification pipeline">
          <span className="chain-step">
            <span className="chain-icon n2">
              <IconDoc width={17} height={17} />
            </span>
            <span className="chain-label">ZK PROOF</span>
            <span className="chain-tag">26 951 B</span>
          </span>
          <span className="chain-arrow" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </span>
          <span className="chain-step">
            <span className="chain-icon n3">
              <IconShield width={17} height={17} />
            </span>
            <span className="chain-label">SOLIDITY VERIFIER</span>
            <span className="chain-tag">Verifier.sol</span>
          </span>
          <span className="chain-arrow" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </span>
          <span className="chain-step chain-step-block">
            <span className="chain-icon n4">
              <ChainGlyph />
            </span>
            <span className="chain-label">BLOCKCHAIN</span>
            <span className="chain-tag">local EVM chain</span>
          </span>
          <span className="chain-arrow" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </span>
          <span className="chain-step">
            <span className="chain-icon chain-ok">
              <IconCheck width={17} height={17} />
            </span>
            <span className="chain-label">VERIFIED</span>
            <span className="chain-tag">mined ✓</span>
          </span>
        </div>

        <div className="mini-cards">
          <div className="mini-card">
            <h4>
              <IconLink width={15} height={15} /> Registered on-chain
            </h4>
            <p>
              A <code>ProofRegistry</code> maps each verifier to its VK digest
              on-chain.
            </p>
          </div>
          <div className="mini-card">
            <h4>
              <IconShield width={15} height={15} /> Locally verified
            </h4>
            <p>
              Deployed on a local EVM chain (ganache, id 1337) — a real
              <code> verify</code> tx mined with <code>result=true</code>.
            </p>
          </div>
          <div className="mini-card">
            <h4>
              <IconCheck width={15} height={15} /> Input stays private
            </h4>
            <p>
              Only the proof and public decision reach the chain — inputs
              never leave the prover.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}