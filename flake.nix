{
  description = "WarEra personal toolkit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; };

      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            turso-cli
            nodejs_26
            pnpm
          ];

          shellHook = ''
            echo "WarEra devenv: node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo n/a)"
            if ! command -v vp >/dev/null 2>&1; then
              echo "Note: install Vite+ CLI with: curl -fsSL https://vite.plus | bash"
            fi
          '';
        };
      }
    );
}
