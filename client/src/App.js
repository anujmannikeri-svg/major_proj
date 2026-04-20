import { useEffect, useState } from "react";

function App() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch("https://major-proj-adz6.onrender.com/exams")
      .then(res => res.json())
      .then(data => setData(data))
      .catch(err => console.log(err));
  }, []);

  return (
    <div>
      <h1>Online Exam System</h1>
      {data.length === 0 ? (
        <p>No data yet</p>
      ) : (
        data.map((item, index) => (
          <div key={index}>
            <p>{item.name}</p>
          </div>
        ))
      )}
    </div>
  );
}

export default App;