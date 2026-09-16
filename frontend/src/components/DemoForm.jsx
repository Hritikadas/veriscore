import { IconMoney, IconCredit, IconBriefcase, IconLock } from "./icons.jsx";

export default function DemoForm({
  income,
  setIncome,
  creditScore,
  setCreditScore,
  yearsEmployed,
  setYearsEmployed,
  busy,
  errors,
  onClearError,
  onSubmit
}) {
  return (
    <div className="pane pane-form">
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="income">Annual Income</label>
          <div className="input-wrap">
            <span className="input-icon">
              <IconMoney width={17} height={17} />
            </span>
            <input
              id="income"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={income}
              onChange={(e) => {
                setIncome(e.target.value);
                onClearError("income");
              }}
              placeholder="e.g. 100000"
              aria-describedby="income-hint"
            />
          </div>
          {errors.income ? (
            <span id="income-error" className="field-error" role="alert">
              {errors.income}
            </span>
          ) : (
            <span id="income-hint" className="field-hint">USD / year — your yearly income (proof circuit max 131,071)</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="creditScore">Credit Score</label>
          <div className="input-wrap">
            <span className="input-icon">
              <IconCredit width={17} height={17} />
            </span>
            <input
              id="creditScore"
              type="number"
              min="0"
              max="850"
              step="1"
              inputMode="numeric"
              value={creditScore}
              onChange={(e) => {
                setCreditScore(e.target.value);
                onClearError("creditScore");
              }}
              placeholder="e.g. 700"
              aria-describedby="credit-hint"
            />
          </div>
          {errors.creditScore ? (
            <span id="credit-error" className="field-error" role="alert">
              {errors.creditScore}
            </span>
          ) : (
            <span id="credit-hint" className="field-hint">0 – 850</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="yearsEmployed">Years Employed</label>
          <div className="input-wrap">
            <span className="input-icon">
              <IconBriefcase width={17} height={17} />
            </span>
            <input
              id="yearsEmployed"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={yearsEmployed}
              onChange={(e) => {
                setYearsEmployed(e.target.value);
                onClearError("yearsEmployed");
              }}
              placeholder="e.g. 3"
              aria-describedby="years-hint"
            />
          </div>
          {errors.yearsEmployed ? (
            <span id="years-error" className="field-error" role="alert">
              {errors.yearsEmployed}
            </span>
          ) : (
            <span id="years-hint" className="field-hint">years</span>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Generating Proof…
            </>
          ) : (
            <>
              Verify Loan Decision <span className="arrow" aria-hidden="true">→</span>
            </>
          )}
        </button>

        <p className="privacy-inline">
          <IconLock width={13} height={13} />
          Raw inputs stay private — never published, never exposed in the proof.
        </p>
      </form>
    </div>
  );
}
