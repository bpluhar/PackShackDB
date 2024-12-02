import React from 'react';
import { FaGithub } from 'react-icons/fa'; // Importing GitHub icon from react-icons

const Footer = ({ className }) => (
  <footer className={`mt-16 text-center text-gray-500 ${className}`}>
    <div className="max-w-4xl mx-auto border-t border-gray-200 pt-8">
      <p className="text-sm">
        © {new Date().getFullYear()} PackShack DB. All rights reserved.
      </p>
      <nav className="mt-4 flex justify-center space-x-4" aria-label="Footer navigation">
        <a
          href="/privacy"
          className="text-sm text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
        >
          Privacy Policy
        </a>
        <a
          href="/contact"
          className="text-sm text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
        >
          Contact Us
        </a>
        <a
          href="https://github.com/packshackdb"
          className="text-sm text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded flex items-center"
          target="_blank"
          rel="noopener noreferrer"
        >
          <FaGithub className="mr-2" /> GitHub
        </a>
      </nav>
    </div>
  </footer>
);

export default Footer;
