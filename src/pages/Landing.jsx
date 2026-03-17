import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-content">
        <h1>Welcome to ChatApp</h1>
        <p>Connect with friends and colleagues instantly</p>
        <div className="landing-buttons">
          <button onClick={() => navigate('/login')} className="btn-primary">Login</button>
          <button onClick={() => navigate('/register')} className="btn-secondary">Register</button>
        </div>
      </div>
    </div>
  );
};

export default Landing;
