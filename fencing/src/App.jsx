import { useState } from 'react'
import SimpleActions from './SimpleActions.jsx'
import SynopticTable from './SynopticTable.jsx'

function App() {
  const [page, setPage] = useState('fencing')

  return (
    <>
      <nav className="page-navigation">
        <button
          type="button"
          className={page === 'fencing' ? 'active' : ''}
          onClick={() => setPage('fencing')}
        >
          Simple Actions
        </button>

        <button
          type="button"
          className={page === 'synoptic' ? 'active' : ''}
          onClick={() => setPage('synoptic')}
        >
          Synoptic Table
        </button>
      </nav>

      {page === 'fencing' ? <SimpleActions /> : <SynopticTable />}
    </>
  )
}

export default App
