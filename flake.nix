{
  description = "Noir.js development environment with all necessary dependencies";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    noir.url    = "github:noir-lang/noir";
  };

  outputs = { self, nixpkgs, noir }: let
    system = builtins.currentSystem;
    pkgs   = import nixpkgs { inherit system; };
  in {
    devShells.${system}.default = pkgs.mkShell {
      buildInputs = with pkgs; [
        # Noir toolchain for circuit compilation
        noir.packages.${system}.default
        
        # Node.js and npm for Noir.js and frontend development
        nodejs_22
        
        # Development utilities
        git
      ];

      shellHook = ''
        echo "?? Noir.js ZK Rock-Paper-Scissors Development Environment"
        echo "=================================================="
        echo "Available tools:"
        echo "  ? nargo $(nargo --version 2>/dev/null || echo 'version')"
        echo "  ? node $(node --version)"
        echo "  ? npm $(npm --version)"
        echo ""
        echo "Quick commands:"
        echo "  ? cd circuit && nargo compile    - Compile Noir circuit"
        echo "  ? cd frontend && npm install     - Install frontend dependencies"
        echo "  ? cd frontend && npm run dev     - Start development server"
        echo "=================================================="
      '';
    };
  };
}

